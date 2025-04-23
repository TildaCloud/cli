import { Flags } from '@oclif/core'
import { format } from "node:util";
import { silent as resolveFrom } from 'resolve-from';
import { resolveGlobal } from 'resolve-global';
import { type Stats } from "node:fs";
import * as path from 'node:path';
import * as cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as semver from 'semver';
import { CommandError } from "@oclif/core/interfaces";
import { parse as parseYaml } from 'yaml'
import { safely } from "../../../lib/utils.js";
import { BaseCommand } from "../../../baseCommand.js";
import { InlineRoutingConfigSchema, NextjsPrerenderManifestV4Schema, NextjsRouteMetaSchema, PackageLockJsonSchema } from "../../../lib/schemas.js";
// @ts-ignore: TS6059
// eslint-disable-next-line import/no-unresolved
import { TildaProgressiveRenderingFileFormat } from "@site/src/lib/schemas.js";
import BuildCommand from '../index.js'
import { type NextConfig } from 'next'
import { z } from 'zod';

const CONFIG_FILES = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
]

const LOCK_FILES = [
    'package-lock.json',
    'pnpm-lock.yaml',
] as const;

export default class BuildNextJs extends BaseCommand<typeof BuildNextJs> {
    static description = 'Build Next.js project'

    static flags = {
        projectDir: Flags.string({
            description: 'Relative path project directory',
            required: true,
            default: process.cwd()
        }),
        buildCommand: Flags.string({
            description: 'Next.js build command',
            required: true,
            default: 'npm run build'
        }),
        ppr: Flags.string({
            description: 'Enable Next.js Partial Prerendering (PPR)',
            options: ['15-canary-v1'],
            required: false,
        })
    }

    private configFilePaths: undefined | { original: string, config: string };

    async run(): Promise<void> {
        const { args, flags } = await this.parse(BuildNextJs)

        const projectDirPath = path.resolve(flags.projectDir);
        this.log(`Building project at`, projectDirPath);

        // ensure project directory exists
        const [errorWithProjectDirStats, projectDirStats] = await safely(fs.stat(projectDirPath));
        if (errorWithProjectDirStats) {
            this.error(`Error checking project directory: ${errorWithProjectDirStats.message}`);
        }
        if (!projectDirStats.isDirectory()) {
            this.error(`Project directory is not a valid directory: ${projectDirPath}`);
        }

        const buildCommand = flags.buildCommand;
        const buildCommandParts = buildCommand.split(' ');
        if (buildCommandParts.length === 0) {
            this.error('Invalid build command');
        }

        const [errorWithChangingDir, changedDir] = await safely(() => process.chdir(projectDirPath));
        if (errorWithChangingDir) {
            this.error(`Error changing directory: ${errorWithChangingDir.message}`);
        }

        // find the right config file
        const [errorWithStatingFiles, configFilesInfo] = await safely(Promise.all(CONFIG_FILES.map((configFile) => fs.stat(path.resolve(projectDirPath, configFile)).then((stats) => ({
            isFile: stats.isFile(),
            filePath: configFile
        }), () => false as const))));
        if (errorWithStatingFiles) {
            this.error(`Error checking config files: ${errorWithStatingFiles.message}`);
        }

        const existingConfigFileInfo = configFilesInfo.find((configFileInfo) => configFileInfo !== false && configFileInfo.isFile);
        if (!existingConfigFileInfo) {
            this.error(`Config file not found: ${CONFIG_FILES.join(', ')}`);
        }

        const configFilePath = path.resolve(projectDirPath, existingConfigFileInfo.filePath);
        this.log('Found config file:', configFilePath);

        const packageJsonFilePath = path.resolve(projectDirPath, 'package.json');
        const [errorWithReadingPackageJson, packageJsonText] = await safely(fs.readFile(packageJsonFilePath, 'utf8'));
        if (errorWithReadingPackageJson) {
            this.error(`Error reading package.json: ${errorWithReadingPackageJson.message}`);
        }

        const [errorWithParsingPackageJson, packageJson] = await safely(() => JSON.parse(packageJsonText));
        if (errorWithParsingPackageJson) {
            this.error(`Error parsing package.json: ${errorWithParsingPackageJson.message}`);
        }

        const frameworkVersionRaw = await this.findNextJsVersion(projectDirPath);
        const [errorWithMinVersionParsing, frameworkVersionMin] = await safely(() => semver.minVersion(frameworkVersionRaw || ''));
        if (errorWithMinVersionParsing) {
            this.error(format('Failed to parse framework version for Next.js', frameworkVersionRaw, errorWithMinVersionParsing));
        }
        if (!frameworkVersionMin) {
            this.error(format('Failed to parse framework version for Next.js', frameworkVersionRaw));
        }

        const nextJsMajorVersion = semver.major(frameworkVersionMin);
        const nextJsMinorVersion = semver.minor(frameworkVersionMin);
        const isNextJsLessThan1340 = semver.lt(frameworkVersionMin, '13.4.0');

        if (isNextJsLessThan1340) {
            this.error(format('Next.js version', frameworkVersionMin, 'is not supported. Please upgrade to Next.js 13.4.0 or later.'));
        }

        const configFileExtension = path.extname(configFilePath);
        const isConfigFileAModule = configFileExtension === '.mjs' || packageJson.type === 'module' || configFileExtension === '.ts';

        const originalConfigFilePath = path.basename(configFilePath, configFileExtension) + '.original' + configFileExtension;
        // check if original config file exists
        const [errorWithCheckingOriginalConfigFileStats, originalConfigFileStats] = await safely<Stats, {
            code?: string
            message?: string
        }>(fs.stat(originalConfigFilePath));
        if (errorWithCheckingOriginalConfigFileStats && errorWithCheckingOriginalConfigFileStats.code !== 'ENOENT') {
            this.error(`Error checking original config file: ${errorWithCheckingOriginalConfigFileStats.message}`);
        }
        if (originalConfigFileStats) {
            this.error(format(`Next.js config original file already exists: ${originalConfigFilePath}.`, 'Please restore', configFilePath, 'manually, delete the original file and run the build command again.'));
        }

        const nextJsConfigOverwrites: NextJsConfigOverrides = {};
        this.debug(format('User config', nextJsConfigOverwrites));

        nextJsConfigOverwrites.output = 'standalone';
        nextJsConfigOverwrites.experimental = nextJsConfigOverwrites.experimental || {};

        const nextJsCaceHandleFileRelativePath = '@tildacloud/cli/dist/assets/nextJsCacheHandler.' + (isConfigFileAModule ? 'mjs' : 'cjs');
        const [, cacheHandlerLocalPath] = await safely(() => resolveFrom(projectDirPath, nextJsCaceHandleFileRelativePath));
        const [, cacheHandlerGlobalPath] = await safely(() => resolveGlobal(nextJsCaceHandleFileRelativePath));
        const currentFilePath = new URL(import.meta.url).pathname;
        const currentWorkingDir = process.cwd();
        // find nearest node_modules in current file's path
        const currentFileNodeModulesDirResult = this.findClosestNodeModulesDir(currentFilePath);
        const currentFilePackageDir = currentFileNodeModulesDirResult ? path.dirname(currentFileNodeModulesDirResult) : currentWorkingDir;
        const [, currentFileRelativeCacheHandlerPath] = await safely(() => resolveFrom(currentFilePackageDir, nextJsCaceHandleFileRelativePath));

        const chosenNextJsCacheHandlerPath = cacheHandlerLocalPath || cacheHandlerGlobalPath || currentFileRelativeCacheHandlerPath;
        if (!chosenNextJsCacheHandlerPath) {
            this.error(format('Cache handler not found:', nextJsCaceHandleFileRelativePath));
        }
        this.debug(format('Chosen cache handler:', chosenNextJsCacheHandlerPath));

        // copy nextJsCacheHandler to projectDirPath/.node_modules/.tilda/nextJsCacheHandler.{mjs,cjs}
        const nextJsTildaAssetsDir = path.resolve(projectDirPath, 'node_modules/.tilda');
        const cacheHandlerFileName = path.basename(chosenNextJsCacheHandlerPath);
        const nextJsCacheHandlerFilePath = path.resolve(nextJsTildaAssetsDir, cacheHandlerFileName);
        const [errorWithCreatingTildaAssetsDir] = await safely(fs.mkdir(nextJsTildaAssetsDir, { recursive: true }));
        if (errorWithCreatingTildaAssetsDir) {
            this.error(`Error creating node_modules/.tilda directory: ${errorWithCreatingTildaAssetsDir.message}`);
        }
        const [errorWithCopyingCacheHandlerFile] = await safely(fs.copyFile(chosenNextJsCacheHandlerPath, nextJsCacheHandlerFilePath));
        if (errorWithCopyingCacheHandlerFile) {
            this.error(`Error copying cache handler file: ${errorWithCopyingCacheHandlerFile.message}`);
        }

        if ((nextJsMajorVersion === 14 && nextJsMinorVersion >= 1) || nextJsMajorVersion > 14) {
            nextJsConfigOverwrites.cacheHandler = nextJsCacheHandlerFilePath;
        }
        if (nextJsMajorVersion === 14 && nextJsMinorVersion >= 1) {
            nextJsConfigOverwrites.experimental.swrDelta = 60 * 60 * 24 * 30 * 12; // 1 year
        }
        if (nextJsMajorVersion === 13 || (nextJsMajorVersion === 14 && nextJsMinorVersion < 1)) {
            nextJsConfigOverwrites.experimental.incrementalCacheHandlerPath = nextJsCacheHandlerFilePath;
        }

        this.debug(format('Next.js config overwrites:', nextJsConfigOverwrites));

        const [errorWithReadingOriginalConfigFile, originalConfigFileText] = await safely(fs.readFile(configFilePath, 'utf8'));
        if (errorWithReadingOriginalConfigFile) {
            this.error(`Error reading original config file: ${errorWithReadingOriginalConfigFile.message}`);
        }

        // copy the original config file to a new file with .original extension
        const [errorWithCopyingConfigFile] = await safely(fs.copyFile(configFilePath, originalConfigFilePath));
        if (errorWithCopyingConfigFile) {
            this.error(`Error copying config file: ${errorWithCopyingConfigFile.message}`);
        }
        this.configFilePaths = { original: originalConfigFilePath, config: configFilePath };

        const tildaConfigFileComment = '// eslint-disable-next-line @typescript-eslint/ban-ts-comment\n' +
            '// @ts-nocheck\n' +
            '// This file is automatically generated by Tilda. If it is not removed automatically, please remove this file and restore Next.js config file with .original suffix in its place.';

        // write the modified config file
        const [errorWithWritingConfigFile] = await safely(fs.writeFile(configFilePath, isConfigFileAModule ?
            `${tildaConfigFileComment}\nimport config from ${JSON.stringify('./' + originalConfigFilePath)};\nconst newConfig = { ...config, ...${JSON.stringify(nextJsConfigOverwrites)}, experimental: { ...config.experimental, ...${JSON.stringify(nextJsConfigOverwrites.experimental)} }, };\nexport default newConfig;` :
            `${tildaConfigFileComment}\nconst config = require(${JSON.stringify('./' + originalConfigFilePath)});\nconst newConfig = { ...config, ...${JSON.stringify(nextJsConfigOverwrites)}, experimental: { ...config.experimental, ...${JSON.stringify(nextJsConfigOverwrites.experimental)} }, };\nmodule.exports = newConfig;`));
        if (errorWithWritingConfigFile) {
            this.error(`Error writing config file: ${errorWithWritingConfigFile.message}`);
        }

        this.log('User config file backed up:', path.relative(projectDirPath, configFilePath), '→', path.relative(projectDirPath, originalConfigFilePath))
        this.log('Wrote modified config file:', path.relative(projectDirPath, configFilePath), 'with Tilda config.');

        this.log('Running build command:', JSON.stringify(buildCommand), 'in', projectDirPath);
        const buildProgram = buildCommandParts[0];
        const buildArgs = buildCommandParts.slice(1);

        const [errorWithBuildCommand] = await safely(() => cp.execFileSync(buildProgram, buildArgs, {
            cwd: projectDirPath,
            stdio: 'inherit',
            env: { ...process.env }
        }));
        if (errorWithBuildCommand) {
            this.error(`Error running build command: ${errorWithBuildCommand.message}`);
        }

        this.log('Next.js build complete');
        await this.restoreConfigFile();

        const serverDir = path.resolve(projectDirPath, '.next/standalone');
        const serverEntryFile = path.resolve(serverDir, 'server.js');
        const rootStaticDir = path.resolve(projectDirPath, 'public');
        const tildaStageDirPath = path.join(projectDirPath, '.tilda', 'stage');

        await fs.rm(tildaStageDirPath, { recursive: true, force: true });
        await fs.mkdir(tildaStageDirPath, { recursive: true });

        const [errorWithReadingConstants, constantsFileText] = await safely(fs.readFile(path.resolve(serverDir, 'node_modules', 'next', 'dist', 'lib', 'constants.js'), 'utf8'));
        if (errorWithReadingConstants) {
            this.error(`Error reading constants file: ${errorWithReadingConstants.message}`);
        }
        const usesNextResumeHeader = constantsFileText.includes('NEXT_RESUME_HEADER');

        // check if .next/standalone/node_modules/next/dist/server/normalizers/request/postponed.js exists
        const [errorWithCheckingPostponedFile, postponedFileStats] = await safely(fs.stat(path.resolve(serverDir, 'node_modules', 'next', 'dist', 'server', 'normalizers', 'request', 'postponed.js')));
        const usesPostponedNormalizer = !errorWithCheckingPostponedFile && postponedFileStats.isFile();

        const inlineRoutingConfig: z.infer<typeof InlineRoutingConfigSchema> = {
            routes: []
        };

        const featureFlags: string[] = [];

        if (flags.ppr === '15-canary-v1') {
            if (!usesNextResumeHeader && !usesPostponedNormalizer) {
                this.error('Next.js 15 canary PPR feature flag is enabled but Next.js version is not compatible.');
            }

            featureFlags.push('nextjs-15-canary-ppr-v1');
            // Read prerender-manifest.json
            const [errorWithReadingPrerenderManifest, prerenderManifestText] = await safely(fs.readFile(path.resolve(serverDir, '.next', 'prerender-manifest.json'), 'utf8'));
            if (errorWithReadingPrerenderManifest) {
                this.error(`Error reading prerender manifest: ${errorWithReadingPrerenderManifest.message}`);
            }

            const [errorWithJsonOfPrerenderManifest, JsonOfPrerenderManifest] = await safely(() => JSON.parse(prerenderManifestText));
            if (errorWithJsonOfPrerenderManifest) {
                this.error(`Error parsing prerender manifest: ${errorWithJsonOfPrerenderManifest.message}`);
            }

            const [errorWithPrerenderManifest, prerenderManifest] = await safely(NextjsPrerenderManifestV4Schema.parseAsync(JsonOfPrerenderManifest));
            if (errorWithPrerenderManifest) {
                this.error(`Error parsing prerender manifest: ${errorWithPrerenderManifest.message}`);
            }

            const relativeUrl = usesNextResumeHeader ? '$$requestRelativeUrl$$' : '$$requestRelativeUrlPrefixedWithNextPostponedResume$$';
            const matchedPath = usesNextResumeHeader ? '$$requestPath$$' : '$$requestPathPrefixedWithNextPostponedResume$$';

            for (const [, { srcRoute, renderingMode, dataRoute, experimentalPPR }] of Object.entries(prerenderManifest.routes)) {
                if (renderingMode === 'PARTIALLY_STATIC' || experimentalPPR) {
                    if (!dataRoute) {
                        this.error('Encountered a route that is partially static but does not have a data route. Please make sure that you\'re using the latest version Tilda CLI. If the issue persists, please contact support.');
                    }

                    // Meta file for this route
                    const metaFilePath = path.join(serverDir, '.next', 'server', "app", path.dirname(dataRoute), path.basename(dataRoute, path.extname(dataRoute)) + '.meta');
                    const [errorWithReadingMetaFile, metaFileText] = await safely(fs.readFile(metaFilePath, 'utf8'));
                    if (errorWithReadingMetaFile) {
                        this.error(`Error reading meta file: ${errorWithReadingMetaFile.message}`);
                    }

                    const [errorWithJsonOfMetaFile, jsonOfMetaFile] = await safely(() => JSON.parse(metaFileText));
                    if (errorWithJsonOfMetaFile) {
                        this.error(`Error parsing meta file: ${errorWithJsonOfMetaFile.message}`);
                    }

                    const [errorWithMeta, meta] = await safely(NextjsRouteMetaSchema.parseAsync(jsonOfMetaFile));
                    if (errorWithMeta) {
                        this.error(`Error parsing meta file: ${errorWithMeta.message}`);
                    }

                    if (!meta.postponed) {
                        this.error(format('Postponed data not found for route', srcRoute));
                    }

                    const htmlFilePath = path.resolve(path.dirname(metaFilePath), path.basename(metaFilePath, path.extname(metaFilePath)) + '.html');

                    const [errorWithReadingHtmlFile, htmlFileText] = await safely(fs.readFile(htmlFilePath, 'utf8'));
                    if (errorWithReadingHtmlFile) {
                        this.error(`Error reading html file: ${errorWithReadingHtmlFile.message}`);
                    }

                    // create a tilda progressive rendering file and place it in the .tilda/stage directory for this path
                    const tildaProgressiveRenderingFilePath = path.join(tildaStageDirPath, path.dirname(dataRoute), path.basename(dataRoute, path.extname(dataRoute)) + '.progressiverendering.json');

                    const headers: Record<string, string[]> = {};
                    for (const [key, value] of Object.entries(meta.headers)) {
                        headers[key] = [value];
                    }
                    headers['content-type'] = ['text/html; charset=utf-8'];

                    const fileContent: TildaProgressiveRenderingFileFormat = {
                        v1: {
                            status: meta.status,
                            headers,
                            body: [
                                { text: htmlFileText },
                                {
                                    remoteBody: {
                                        relativeUrl,
                                        forwardRequestHeaders: true,
                                        additionalHeaders: {
                                            'next-resume': '1',
                                            'tilda-internal-next-matched-path': matchedPath,
                                            'x-matched-path': matchedPath,
                                            'content-type': 'text/plain',
                                        },
                                        method: 'POST',
                                        body: meta.postponed,
                                    }
                                }
                            ]
                        }
                    }

                    const [errorWithWritingTildaProgressiveRenderingFile] = await safely(() => fs.writeFile(tildaProgressiveRenderingFilePath, JSON.stringify(fileContent, null, 2)));
                    if (errorWithWritingTildaProgressiveRenderingFile) {
                        this.error(`Error writing tilda progressive render file: ${errorWithWritingTildaProgressiveRenderingFile.message}`);
                    }

                    const prResponseHeaders: [string, string][] = [['progressive-rendering-format', '1'], ['content-type', 'application/json']];
                    if (meta.headers['x-next-cache-tags']) {
                        prResponseHeaders.push(['x-next-cache-tags', meta.headers['x-next-cache-tags']]);
                    }

                    inlineRoutingConfig.routes.push({
                        criteria: { path: { exact: srcRoute }, method: ['GET', 'HEAD'] },
                        action: {
                            origin: 'static',
                            headers: prResponseHeaders,
                            staticFileRelativePath: path.join(path.dirname(dataRoute), path.basename(dataRoute, path.extname(dataRoute)) + '.progressiverendering.json'),
                        },
                    })
                }
            }

            for (const [, { renderingMode, experimentalPPR, fallbackSourceRoute, routeRegex }] of Object.entries(prerenderManifest.dynamicRoutes)) {
                if (renderingMode === 'PARTIALLY_STATIC' || experimentalPPR) {
                    // Meta file for this route
                    const metaFilePath = path.join(serverDir, '.next', 'server', "app", fallbackSourceRoute + '.meta');
                    const [errorWithReadingMetaFile, metaFileText] = await safely(fs.readFile(metaFilePath, 'utf8'));
                    if (errorWithReadingMetaFile) {
                        this.error(`Error reading meta file: ${errorWithReadingMetaFile.message}`);
                    }

                    const [errorWithJsonOfMetaFile, jsonOfMetaFile] = await safely(() => JSON.parse(metaFileText));
                    if (errorWithJsonOfMetaFile) {
                        this.error(`Error parsing meta file: ${errorWithJsonOfMetaFile.message}`);
                    }

                    const [errorWithMeta, meta] = await safely(NextjsRouteMetaSchema.parseAsync(jsonOfMetaFile));
                    if (errorWithMeta) {
                        this.error(`Error parsing meta file: ${errorWithMeta.message}`);
                    }

                    if (!meta.postponed) {
                        this.error(format('Postponed data not found for route', fallbackSourceRoute));
                    }

                    const htmlFilePath = path.resolve(path.dirname(metaFilePath), path.basename(metaFilePath, path.extname(metaFilePath)) + '.html');

                    const [errorWithReadingHtmlFile, htmlFileText] = await safely(fs.readFile(htmlFilePath, 'utf8'));
                    if (errorWithReadingHtmlFile) {
                        this.error(`Error reading html file: ${errorWithReadingHtmlFile.message}`);
                    }

                    // create a tilda progressive render file and place it in the .tilda/stage directory for this path
                    const tildaProgressiveRenderingFilePath = path.join(tildaStageDirPath, fallbackSourceRoute + '.progressiverendering.json');
                    // ensure the directory exists
                    await fs.mkdir(path.dirname(tildaProgressiveRenderingFilePath), { recursive: true });

                    const headers: Record<string, string[]> = {};
                    for (const [key, value] of Object.entries(meta.headers)) {
                        headers[key] = [value];
                    }
                    headers['content-type'] = ['text/html; charset=utf-8'];

                    const fileContent: TildaProgressiveRenderingFileFormat = {
                        v1: {
                            status: meta.status,
                            headers,
                            body: [
                                { text: htmlFileText },
                                {
                                    remoteBody: {
                                        relativeUrl,
                                        forwardRequestHeaders: true,
                                        additionalHeaders: {
                                            'next-resume': '1',
                                            'tilda-internal-next-matched-path': matchedPath,
                                            'x-matched-path': matchedPath,
                                            'content-type': 'text/plain',
                                        },
                                        method: 'POST',
                                        body: meta.postponed,
                                    }
                                }
                            ]
                        }
                    };

                    const [errorWithWritingTildaProgressiveRenderingFile] = await safely(() => fs.writeFile(tildaProgressiveRenderingFilePath, JSON.stringify(fileContent, null, 2)));
                    if (errorWithWritingTildaProgressiveRenderingFile) {
                        this.error(`Error writing tilda progressive render file: ${errorWithWritingTildaProgressiveRenderingFile.message}`);
                    }

                    const prResponseHeaders: [string, string][] = [['progressive-rendering-format', '1'], ['content-type', 'application/json']];
                    if (meta.headers['x-next-cache-tags']) {
                        prResponseHeaders.push(['x-next-cache-tags', meta.headers['x-next-cache-tags']]);
                    }

                    inlineRoutingConfig.routes.push({
                        criteria: { path: { regex: routeRegex }, method: ['GET', 'HEAD'] },
                        action: {
                            origin: 'static',
                            headers: prResponseHeaders,
                            staticFileRelativePath: fallbackSourceRoute + '.progressiverendering.json',
                        },
                    });
                }
            }
        }

        this.log('Building Tilda package');
        // check if root static dir exists
        const [errorWithRootStaticDirStats, rootStaticDirStats] = await safely<Stats, {
            code?: string,
            message?: string
        }>(fs.stat(rootStaticDir));
        if (errorWithRootStaticDirStats && errorWithRootStaticDirStats.code !== 'ENOENT') {
            this.error(`Error checking root static dir: ${errorWithRootStaticDirStats.message}`);
        }

        const underscoreNamedStaticDir = path.resolve(projectDirPath, '.next/static');
        await BuildCommand.run([
            '--projectDir', projectDirPath,
            '--serverDir', serverDir,
            '--serverEntryFile', serverEntryFile,
            '--underscoreNamedStaticDir', underscoreNamedStaticDir,
            ...(rootStaticDirStats?.isDirectory() ? ['--rootStaticDir', rootStaticDir] : []),
            '--rootStaticDir', tildaStageDirPath,
            ...(inlineRoutingConfig.routes.length > 0 ? ['--routingConfigJson', JSON.stringify(inlineRoutingConfig)] : []),
            ...(featureFlags.length > 0 ? ['--featureFlag', ...featureFlags] : []),
            '--framework', 'nextjs',
            '--frameworkVersion', frameworkVersionRaw,
            '--preserveStage',
        ]);

        this.log('Tilda package built');
    }

    async catch(error: CommandError) {
        await this.restoreConfigFile().catch(() => {
        });
        throw error;
    }

    async restoreConfigFile() {
        if (this.configFilePaths) {
            const configFileDir = path.dirname(this.configFilePaths.config);
            // restore the original config file
            const [errorWithRestoringConfigFile] = await safely(fs.copyFile(this.configFilePaths.original, this.configFilePaths.config));
            if (errorWithRestoringConfigFile) {
                this.error(`Error restoring config file: ${errorWithRestoringConfigFile.message}`);
            }
            // remove the original reference config file
            const [errorWithRemovingOriginalConfigFile] = await safely(fs.rm(this.configFilePaths.original));
            if (errorWithRemovingOriginalConfigFile) {
                this.error(`Error removing original config file: ${errorWithRemovingOriginalConfigFile.message}`);
            }

            this.log('Restored original config file:', path.relative(configFileDir, this.configFilePaths.original), '→', path.relative(configFileDir, this.configFilePaths.config));
        }
    }


    findClosestNodeModulesDir(filePath: string) {
        let currentPath = path.dirname(filePath);

        while (currentPath !== path.parse(currentPath).root) {
            const currentDirName = path.basename(currentPath);
            if (currentDirName === 'node_modules') {
                return currentPath;
            }
            currentPath = path.dirname(currentPath);
        }

        return null;
    }

    async findNextJsVersion(projectDirPath: string) {
        // find the right lock file
        const [errorWithStatingFiles, lockFilesInfo] = await safely(Promise.all(LOCK_FILES.map((lockFile) => fs.stat(path.resolve(projectDirPath, lockFile)).then((stats) => ({
            isFile: stats.isFile(),
            filePath: lockFile
        }), () => false as const))));
        if (errorWithStatingFiles) {
            this.error(`Error checking lock files: ${errorWithStatingFiles.message}`);
        }

        const existingLockFileInfo = lockFilesInfo.find((lockFileInfo) => lockFileInfo !== false && lockFileInfo.isFile);
        if (!existingLockFileInfo) {
            this.error(`Lock file not found: ${LOCK_FILES.join(', ')}`);
        }

        const lockFilePath = path.resolve(projectDirPath, existingLockFileInfo.filePath);
        this.log('Found lock file:', lockFilePath);
        const lockFileName = path.basename(lockFilePath);

        const [errorWithReadingLockFile, lockFileText] = await safely(fs.readFile(lockFilePath, 'utf8'));
        if (errorWithReadingLockFile) {
            this.error(`Error reading lock file (${lockFilePath}): ${errorWithReadingLockFile.message}`);
        }

        if (lockFileName === 'package-lock.json') {
            const [errorWithParsingPackageLockJson, packageLockJson] = await safely(() => JSON.parse(lockFileText));
            if (errorWithParsingPackageLockJson) {
                this.error(`Error parsing package-lock.json: ${errorWithParsingPackageLockJson.message}`);
            }

            const [errorWithValidatingPackageLockJson, packageLock] = await safely(PackageLockJsonSchema.parseAsync(packageLockJson));
            if (errorWithValidatingPackageLockJson) {
                this.error(`Error validating package-lock.json: ${errorWithValidatingPackageLockJson.message}`);
            }

            if (packageLock?.lockfileVersion !== 3) {
                console.warn('Unsupported package-lock.json version', packageLock.lockfileVersion);
            }

            const packageNext = packageLockJson?.packages['node_modules/next'];
            const frameworkVersionRaw = packageNext?.version;
            if (!frameworkVersionRaw) {
                this.error('Next.js version not found in package-lock.json');
            }

            return frameworkVersionRaw;
        }

        if (lockFileName === 'pnpm-lock.yaml') {
            const [errorWithParsingPnpmLockYaml, pnpmLockYaml] = await safely(() => parseYaml(lockFileText));
            if (errorWithParsingPnpmLockYaml) {
                this.error(`Error parsing pnpm-lock.yaml: ${errorWithParsingPnpmLockYaml.message}`);
            }

            if (!pnpmLockYaml) {
                this.error('Invalid pnpm-lock.yaml');
            }

            const lockFileVersion = pnpmLockYaml.lockfileVersion;
            if (lockFileVersion !== "9.0") {
                console.warn('Unsupported pnpm-lock.yaml version', lockFileVersion);
            }

            const nextjsPackageDefinitionName = Object.keys(pnpmLockYaml.packages).find((packageName) => packageName.startsWith('next@'));
            if (!nextjsPackageDefinitionName) {
                this.error('Next.js package ("next") not found in pnpm-lock.yaml dependencies');
            }

            const [, nextJsPackageVersionRaw] = nextjsPackageDefinitionName.split('@');
            if (!nextJsPackageVersionRaw) {
                this.error('Next.js version not found in pnpm-lock.yaml');
            }

            return nextJsPackageVersionRaw;
        }

        this.error(format('Support for lock file', lockFileName, 'not implemented'), {
            code: 'UNSUPPORTED_LOCK_FILE'
        });
    }
}

type NextJsConfigOverrides = Omit<NextConfig, "experimental"> & {
    experimental?: NextConfig['experimental'] & {
        swrDelta?: number
        incrementalCacheHandlerPath?: string
    }
}
