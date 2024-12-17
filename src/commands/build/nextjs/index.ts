import {Flags} from '@oclif/core'
import {format} from "node:util";
import {silent as resolveFrom} from 'resolve-from';
import {resolveGlobal} from 'resolve-global';
import {type Stats} from "node:fs";
import * as path from 'node:path';
import * as cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as semver from 'semver';
import {CommandError} from "@oclif/core/interfaces";
import {safely} from "../../../lib/utils.js";
import {BaseCommand} from "../../../baseCommand.js";
import {PackageLockJsonSchema} from "../../../lib/schemas.js";
import BuildCommand from '../index.js'
import { type NextConfig  } from 'next'

const CONFIG_FILES = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
]

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
    }

    private configFilePaths: undefined | { original: string, config: string };

    async run(): Promise<void> {
        const {args, flags} = await this.parse(BuildNextJs)

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

        const packageLockJsonFilePath = path.resolve(projectDirPath, 'package-lock.json');
        const [errorWithReadingPackageLockJson, packageLockJsonText] = await safely(fs.readFile(packageLockJsonFilePath, 'utf8'));
        if (errorWithReadingPackageLockJson) {
            this.error(`Error reading package-lock.json: ${errorWithReadingPackageLockJson.message}`);
        }

        const [errorWithParsingPackageLockJson, packageLockJson] = await safely(() => JSON.parse(packageLockJsonText));
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

        const nextJsImageLoaderFilePath = path.join(path.dirname(chosenNextJsCacheHandlerPath), 'nextjs-image-loader.mjs');
        this.debug('Copying image loader file:', nextJsImageLoaderFilePath);

        // copy nextJsCacheHandler to projectDirPath/.node_modules/.tilda/nextJsCacheHandler.{mjs,cjs}
        const nextJsTildaAssetsDir = path.resolve(projectDirPath, 'node_modules/.tilda');
        const cacheHandlerFileName = path.basename(chosenNextJsCacheHandlerPath);
        const nextJsCacheHandlerFilePath = path.resolve(nextJsTildaAssetsDir, cacheHandlerFileName);
        const [errorWithCreatingTildaAssetsDir] = await safely(fs.mkdir(nextJsTildaAssetsDir, {recursive: true}));
        if (errorWithCreatingTildaAssetsDir) {
            this.error(`Error creating node_modules/.tilda directory: ${errorWithCreatingTildaAssetsDir.message}`);
        }
        const [errorWithCopyingCacheHandlerFile] = await safely(fs.copyFile(chosenNextJsCacheHandlerPath, nextJsCacheHandlerFilePath));
        if (errorWithCopyingCacheHandlerFile) {
            this.error(`Error copying cache handler file: ${errorWithCopyingCacheHandlerFile.message}`);
        }

        const [errorWithCopyingImageLoaderFile] = await safely(fs.copyFile(nextJsImageLoaderFilePath, path.resolve(nextJsTildaAssetsDir, 'nextjs-image-loader.mjs')));
        if (errorWithCopyingImageLoaderFile) {
            this.error(`Error copying image loader file: ${errorWithCopyingImageLoaderFile.message}`);
        }

        nextJsConfigOverwrites.images = {
            loader: 'custom',
            loaderFile: path.relative(projectDirPath, nextJsImageLoaderFilePath),
        }

        // Apply Next.js 14.1 + related config changes
        if (nextJsMajorVersion === 14 && nextJsMinorVersion >= 1) {
            nextJsConfigOverwrites.cacheHandler = nextJsCacheHandlerFilePath;
            nextJsConfigOverwrites.experimental.swrDelta = 60 * 60 * 24 * 30 * 12; // 1 year
        } else if (nextJsMajorVersion === 13 || (nextJsMajorVersion === 14 && nextJsMinorVersion < 1)) {
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
        this.configFilePaths = {original: originalConfigFilePath, config: configFilePath};

        const tildaConfigFileComment = '// eslint-disable-next-line @typescript-eslint/ban-ts-comment\n' +
            '// @ts-nocheck\n' +
            '// This file is automatically generated by Tilda. If it is not removed automatically, please remove this file and restore Next.js config file with .original suffix in its place.';

        // write the modified config file
        const [errorWithWritingConfigFile] = await safely(fs.writeFile(configFilePath, isConfigFileAModule ?
            `${tildaConfigFileComment}\nimport config from ${JSON.stringify('./' + originalConfigFilePath)};\nconst newConfig = { ...config, ...${JSON.stringify(nextJsConfigOverwrites)}, experimental: { ...config.experimental, ...${JSON.stringify(nextJsConfigOverwrites.experimental)} }, images: { ...${JSON.stringify(nextJsConfigOverwrites.images)}, ...config.images } };\nexport default newConfig;` :
            `${tildaConfigFileComment}\nconst config = require(${JSON.stringify('./' + originalConfigFilePath)});\nconst newConfig = { ...config, ...${JSON.stringify(nextJsConfigOverwrites)}, experimental: { ...config.experimental, ...${JSON.stringify(nextJsConfigOverwrites.experimental)} }, images: { ...${JSON.stringify(nextJsConfigOverwrites.images)}, ...config.images } };\nmodule.exports = newConfig;`));
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
            env: {...process.env}
        }));
        if (errorWithBuildCommand) {
            this.error(`Error running build command: ${errorWithBuildCommand.message}`);
        }

        this.log('Next.js build complete');
        await this.restoreConfigFile();

        this.log('Building Tilda package');

        const serverDir = path.resolve(projectDirPath, '.next/standalone');
        const serverEntryFile = path.resolve(serverDir, 'server.js');
        const rootStaticDir = path.resolve(projectDirPath, 'public');

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
            ...(rootStaticDirStats?.isDirectory() ? ['--rootStaticDir', rootStaticDir] : [])
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
}

type NextJsConfigOverrides = Omit<NextConfig, "experimental"> & {
    experimental?: NextConfig['experimental'] & {
        swrDelta?: number
        incrementalCacheHandlerPath?: string
    }
}
