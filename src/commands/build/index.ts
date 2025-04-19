import { Flags } from '@oclif/core'
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { format } from "node:util";
import JSZip from "jszip";
import { infer as ZInfer } from 'zod'
import { nodeFileTrace } from '@vercel/nft';
import { safely } from "../../lib/utils.js";
import { BaseCommand } from "../../baseCommand.js";
import { InlineRoutingConfigSchema, TildaDeploymentMetadataSchema } from '../../lib/schemas.js';

const LOCK_FILES = [
    'package-lock.json',
    'pnpm-lock.yaml',
] as const;

export default class Build extends BaseCommand<typeof Build> {
    static description = 'Build the application'

    static flags = {
        serverDir: Flags.string({ description: 'Relative path to server files directory', required: true }),
        rootStaticDir: Flags.string({
            description: 'Relative path to static files directory that will be served from root (/)',
            required: false,
            multiple: true,
        }),
        underscoreNamedStaticDir: Flags.string({
            description: 'Relative path to static files directory that will be served from relative path with "." replaced with "_"',
            required: false
        }),
        projectDir: Flags.string({ description: 'Relative path project directory', required: true }),
        serverEntryFile: Flags.string({ description: 'Relative path to server entry file', required: true }),
        routingConfigJson: Flags.string({ description: 'Inline JSON of routing config', required: false, default: '{"routes":[]}' }),
        featureFlag: Flags.string({ description: 'Feature flag', required: false, multiple: true, }),
        framework: Flags.string({ description: 'Framework name', required: true, }),
        frameworkVersion: Flags.string({ description: 'Framework version', required: true, }),
        preserveStage: Flags.boolean({ description: 'Keep the staging directory (.tilda/stage) intact', required: false, default: false }),
    }

    async run(): Promise<void> {
        const { args, flags } = await this.parse(Build)

        const projectDirPath = path.resolve(flags.projectDir);
        const serverDirPath = path.resolve(flags.serverDir);
        const rootStaticDirPaths = flags.rootStaticDir?.map(dir => path.resolve(dir)) || [];
        const underscoreNamedStaticDirPath = flags.underscoreNamedStaticDir ? path.resolve(flags.underscoreNamedStaticDir) : undefined;
        const serverEntryFilePath = path.resolve(flags.serverEntryFile);

        // ensure the project directory exists
        const [errorWithCheckingProjectDirStats, projectDirStats] = await safely(fs.stat(projectDirPath));
        if (errorWithCheckingProjectDirStats) {
            this.error(`Error checking project directory: ${errorWithCheckingProjectDirStats.message}`);
        }
        if (!projectDirStats.isDirectory()) {
            this.error(`Project directory does not exist: ${projectDirPath}`);
        }

        // ensure the server directory exists
        const [errorWithCheckingServerDirStats, serverDirStats] = await safely(fs.stat(serverDirPath));
        if (errorWithCheckingServerDirStats) {
            this.error(`Error checking server directory: ${errorWithCheckingServerDirStats.message}`);
        }
        if (!serverDirStats.isDirectory()) {
            this.error(`Server directory does not exist: ${serverDirPath}`);
        }

        if (rootStaticDirPaths.length) {
            for (const rootStaticDirPath of rootStaticDirPaths) {
                // ensure the root static directory exists
                const [errorWithCheckingStaticDirStats, staticDirStats] = await safely(fs.stat(rootStaticDirPath));
                if (errorWithCheckingStaticDirStats) {
                    this.error(`Error checking static directory: ${errorWithCheckingStaticDirStats.message}`);
                }
                if (!staticDirStats.isDirectory()) {
                    this.error(`Static directory does not exist: ${rootStaticDirPath}`);
                }
            }
        }

        // ensure the underscore named static directory exists
        if (underscoreNamedStaticDirPath) {
            const [errorWithCheckingStaticDirStats, staticDirStats] = await safely(fs.stat(underscoreNamedStaticDirPath));
            if (errorWithCheckingStaticDirStats) {
                this.error(`Error checking static directory: ${errorWithCheckingStaticDirStats.message}`);
            }
            if (!staticDirStats.isDirectory()) {
                this.error(`Static directory does not exist: ${underscoreNamedStaticDirPath}`);
            }
        }

        // ensure the server entry file exists
        const [errorWithCheckingServerEntryFileStats, serverEntryFileStats] = await safely(fs.stat(serverEntryFilePath));
        if (errorWithCheckingServerEntryFileStats) {
            this.error(`Error checking server entry file: ${errorWithCheckingServerEntryFileStats.message}`);
        }
        if (!serverEntryFileStats.isFile()) {
            this.error(`Server entry file does not exist: ${serverEntryFilePath}`);
        }

        // ensure that server entry file is in the server directory
        if (!serverEntryFilePath.startsWith(serverDirPath)) {
            this.error(`Server entry file must be in the server directory: ${serverEntryFilePath}`);
        }

        // create .tilda directory if it doesn't exist
        const tildaDirPath = path.join(projectDirPath, '.tilda');
        await fs.mkdir(tildaDirPath, { recursive: true });

        // remove the .tilda/build directory if it exists
        const tildaBuildDirPath = path.join(tildaDirPath, 'build');
        const [errorWithRemovingTildaBuildDir] = await safely(fs.rm(tildaBuildDirPath, {
            recursive: true,
            force: true,
        }));
        if (errorWithRemovingTildaBuildDir) {
            this.error(`Error removing .tilda/build directory: ${errorWithRemovingTildaBuildDir.message}`);
        }

        // create .tilda/stage directory if it doesn't exist or if preserveStage flag is false
        const tildaStageDirPath = path.join(tildaDirPath, 'stage');
        if (!flags.preserveStage) {
            const [errorWithRemovingTildaStageDir] = await safely(fs.rm(tildaStageDirPath, {
                recursive: true,
                force: true,
            }));
            if (errorWithRemovingTildaStageDir) {
                this.error(`Error removing .tilda/stage directory: ${errorWithRemovingTildaStageDir.message}`);
            }
        }
        await fs.mkdir(tildaStageDirPath, { recursive: true });

        // trace the server entry file
        const [errorWithTracingEntryFile, serverFileTrace] = await safely(nodeFileTrace([serverEntryFilePath], {
            base: projectDirPath,
            processCwd: projectDirPath,
        }));
        if (errorWithTracingEntryFile) {
            this.error(`Error tracing server entry file: ${errorWithTracingEntryFile.message}`);
        }

        // create directories for static files, compute files, and debug files
        const tildaBuildStaticDirPath = path.join(tildaBuildDirPath, 'static');
        const tildaBuildComputeDirPath = path.join(tildaBuildDirPath, 'compute', path.basename(serverDirPath));
        const tildaDebugDirPath = path.join(tildaBuildDirPath, 'debug');

        if (rootStaticDirPaths.length) {
            if (rootStaticDirPaths.length > 1) {
                const existingFilePaths: string[] = [];
                for (const rootStaticDirPath of rootStaticDirPaths) {
                    const filePathsInDir = await fs.readdir(rootStaticDirPath, { recursive: true });
                    for (const filePath of filePathsInDir) {
                        if (!existingFilePaths.includes(filePath)) {
                            existingFilePaths.push(filePath);
                        } else {
                            this.log(`Static file ${filePath} is present in multiple root static directories. It will be overwritten.`);
                        }
                    }
                }
            }
            for (const rootStaticDirPath of rootStaticDirPaths) {
                this.debug('Copying root static files directories');
                const [errorWithCopyingStaticFilesDir] = await safely(fs.cp(rootStaticDirPath, tildaBuildStaticDirPath, {
                    recursive: true,
                    verbatimSymlinks: true,
                }));
                if (errorWithCopyingStaticFilesDir) {
                    this.error(`Error copying static files directory: ${errorWithCopyingStaticFilesDir.message}`);
                }
            }
        }
        if (underscoreNamedStaticDirPath) {
            this.debug('Copying underscore named static files directories');
            const dirName = path.relative(projectDirPath, underscoreNamedStaticDirPath).replace('.', '_');
            const [errorWithCopyingStaticFilesDir] = await safely(fs.cp(underscoreNamedStaticDirPath, path.join(tildaBuildStaticDirPath, dirName), {
                recursive: true,
                verbatimSymlinks: true,
            }));
            if (errorWithCopyingStaticFilesDir) {
                this.error(`Error copying underscore named static files directory: ${errorWithCopyingStaticFilesDir.message}`);
            }
        }

        this.debug('Copying server files directory');
        const [errorWithCopyingServerFilesDir] = await safely(fs.cp(serverDirPath, tildaBuildComputeDirPath, {
            recursive: true,
            verbatimSymlinks: true,
        }));
        if (errorWithCopyingServerFilesDir) {
            this.error(`Error copying server files directory: ${errorWithCopyingServerFilesDir.message}`);
        }

        const staticDirPathsRelativeToProjectDirs = rootStaticDirPaths.map(staticDirPath => path.relative(projectDirPath, staticDirPath));
        const underscoreNamedStaticDirPathRelativeToProjectDir = underscoreNamedStaticDirPath ? path.relative(projectDirPath, underscoreNamedStaticDirPath) : underscoreNamedStaticDirPath;
        const serverDirPathRelativeToProjectDir = path.relative(projectDirPath, serverDirPath);

        const entryFileDependencies = new Set<string>();
        for (const dependency of serverFileTrace.fileList) {
            if (underscoreNamedStaticDirPathRelativeToProjectDir && dependency.startsWith(underscoreNamedStaticDirPathRelativeToProjectDir + '/')) {
                continue;
            }
            if (staticDirPathsRelativeToProjectDirs.length && staticDirPathsRelativeToProjectDirs.some(staticDirPathRelativeToProjectDir => dependency.startsWith(staticDirPathRelativeToProjectDir + '/'))) {
                continue;
            }
            if (dependency.startsWith(serverDirPathRelativeToProjectDir + '/')) {
                continue;
            }
            if (dependency === path.relative(projectDirPath, path.join(projectDirPath, 'package.json'))) {
                // check if package.json has a type field
                const packageJsonFilePath = path.resolve(projectDirPath, 'package.json');
                const [errorWithReadingPackageJson, packageJsonText] = await safely(fs.readFile(packageJsonFilePath, 'utf8'));
                if (errorWithReadingPackageJson) {
                    this.error(`Error reading package.json: ${errorWithReadingPackageJson.message}`);
                }
                const [errorWithParsingPackageJson, packageJson] = await safely(() => JSON.parse(packageJsonText));
                if (errorWithParsingPackageJson) {
                    this.error(`Error parsing package.json: ${errorWithParsingPackageJson.message}`);
                }
                if (!packageJson.type) {
                    continue;
                }
                // write a new package.json file that only has a type field
                const newPackageJsonText = JSON.stringify({ type: packageJson.type }, null, 2);
                const newPackageJsonFilePath = path.join(tildaBuildComputeDirPath, 'package.json');
                const [errorWithWritingNewPackageJson] = await safely(() => fs.writeFile(newPackageJsonFilePath, newPackageJsonText));
                if (errorWithWritingNewPackageJson) {
                    this.error(`Error writing new package.json: ${errorWithWritingNewPackageJson.message}`);
                }
                continue;
            }

            entryFileDependencies.add(dependency);
        }

        this.debug('Copying server entry file dependencies');
        for (const dependency of entryFileDependencies) {
            const dependencyAbsolutePath = path.join(projectDirPath, dependency);
            const destinationAbsolutePath = path.join(tildaBuildComputeDirPath, dependency);
            const [errorWithCopyingADependency] = await safely(fs.cp(dependencyAbsolutePath, destinationAbsolutePath, {
                verbatimSymlinks: true,
            }));
            if (errorWithCopyingADependency) {
                this.error(`Error copying a dependency (${dependencyAbsolutePath}): ${errorWithCopyingADependency.message}`);
            }
        }

        this.debug('Copying debug files');
        const [errorWithCopyingDebugServerFiles] = await safely(fs.cp(serverDirPath, path.join(tildaDebugDirPath, path.basename(serverDirPath)), {
            recursive: true,
            verbatimSymlinks: true,
        }));
        if (errorWithCopyingDebugServerFiles) {
            this.error(`Error copying debug files for server: ${errorWithCopyingDebugServerFiles.message}`);
        }

        // find the available lock files
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

        // copy the lock files to the debug directory
        for (const lockFileInfo of lockFilesInfo) {
            if (!lockFileInfo) {
                continue;
            }

            const [errorWithCopyingLockFile] = await safely(fs.cp(path.join(projectDirPath, lockFileInfo.filePath), path.join(tildaDebugDirPath, lockFileInfo.filePath), {
                dereference: true,
            }));
            if (errorWithCopyingLockFile) {
                this.error(`Error copying lock file: ${errorWithCopyingLockFile.message}`);
            }
        }

        const [errorWithReadingFiles, filesInTildaBuildDir] = await safely(fs.readdir(tildaBuildDirPath, {
            withFileTypes: true,
            recursive: true,
        }));
        if (errorWithReadingFiles) {
            this.error(`Error reading files in .tilda/build directory: ${errorWithReadingFiles.message}`);
        }

        const computeFiles = filesInTildaBuildDir
            .filter((entry) => {
                const fileAbsolutePath = path.join(entry.parentPath ?? entry.path, entry.name);
                const relativePath = path.relative(tildaBuildDirPath, fileAbsolutePath);
                return entry.isFile() && relativePath.startsWith('compute/');
            });

        const [errorWithParsingInlineConfigAsJson, jsonOfInlineConfig] = await safely(() => JSON.parse(flags.routingConfigJson));
        if (errorWithParsingInlineConfigAsJson) {
            this.error(`Error parsing inline routing config: ${errorWithParsingInlineConfigAsJson.message}`);
        }

        const [errorWithParsingInlineRoutingConfig, inlineRoutingConfig] = await safely(InlineRoutingConfigSchema.parseAsync(jsonOfInlineConfig))
        if (errorWithParsingInlineRoutingConfig) {
            this.error(`Error parsing inline routing config: ${errorWithParsingInlineRoutingConfig.message}`);
        }

        const staticFiles = filesInTildaBuildDir
            .filter((entry) => {
                const fileAbsolutePath = path.join(entry.parentPath ?? entry.path, entry.name);
                const relativePath = path.relative(tildaBuildDirPath, fileAbsolutePath);
                const relativeStaticPath = path.join('/', path.relative(path.join(tildaBuildDirPath, 'static'), fileAbsolutePath));
                return entry.isFile() && relativePath.startsWith('static/') && !inlineRoutingConfig.routes.some(route => route.action.staticFileRelativePath === relativeStaticPath);
            });


        const [errorWithParsingFeatureFlags, featureFlags] = await safely(TildaDeploymentMetadataSchema.shape.v2.shape.featureFlags.parseAsync(flags.featureFlag));
        if (errorWithParsingFeatureFlags) {
            this.error(`Error parsing feature flags: ${errorWithParsingFeatureFlags.message}`);
        }

        const buildMetadata: ZInfer<typeof TildaDeploymentMetadataSchema> = {
            v2: {
                nodeJsVersion: process.version,
                serverEntryFilePathRelativeToComputeDir: path.join(path.basename(serverDirPath), path.relative(serverDirPath, serverEntryFilePath)),
                featureFlags: featureFlags,
                framework: flags.framework,
                frameworkVersion: flags.frameworkVersion,
                routes: [
                    ...(inlineRoutingConfig.routes.map(route => ({
                        criteria: route.criteria,
                        action: { ...route.action, ...(route.action.staticFileRelativePath && { originPath: route.action.staticFileRelativePath, staticFileRelativePath: undefined }) }
                    } as const))),
                    ...(staticFiles
                        .map((entry): ZInfer<typeof TildaDeploymentMetadataSchema>['v2']['routes'][0] => {
                            const fileAbsolutePath = path.join(entry.parentPath ?? entry.path, entry.name);
                            const pathRelativeToStaticDir = path.relative(path.join(tildaBuildDirPath, 'static'), fileAbsolutePath);

                            const routePath = path.join('/', pathRelativeToStaticDir);

                            if (path.basename(fileAbsolutePath) === 'index.html') {
                                return {
                                    criteria: {
                                        path: {
                                            oneOf: [routePath, routePath.replace(/\/index\.html$/, ''), routePath.replace(/\/index\.html$/, '/')],
                                        }
                                    },
                                    action: {
                                        origin: 'static',
                                        originPath: routePath,
                                    }
                                } as const;
                            }

                            if (fileAbsolutePath.endsWith('.tildaprogressiverender.json')) {
                                this.error(format("Stray", JSON.stringify(pathRelativeToStaticDir), "file should've been accounted for in inline routing config"));
                            }

                            if (path.extname(fileAbsolutePath) === '.html') {
                                return {
                                    criteria: {
                                        path: {
                                            oneOf: [routePath, routePath.replace(/\.html$/, '')],
                                        }
                                    },
                                    action: {
                                        origin: 'static',
                                        originPath: routePath,
                                    }
                                } as const;
                            }

                            return {
                                criteria: {
                                    path: {
                                        exact: routePath,
                                    }
                                },
                                action: {
                                    origin: 'static',
                                }
                            } as const;
                        })
                    ),
                    ...(computeFiles.length > 0 ? [{
                        criteria: {
                            path: {
                                prefix: '/',
                            }
                        },
                        action: {
                            origin: 'compute',
                        }
                    } as const] : []
                    )
                ],
            }
        }

        // write build metadata to .tilda/build directory
        const metadataFilePath = path.join(tildaBuildDirPath, 'metadata.json');

        this.debug('metadataFilePath', metadataFilePath);

        const [errorWithWritingMetadata] = await safely(fs.writeFile(metadataFilePath, JSON.stringify(buildMetadata, null, 2)));
        if (errorWithWritingMetadata) {
            this.error(`Error writing build metadata: ${errorWithWritingMetadata.message}`);
        }

        // zip everything in .tilda/build directory
        const zip = new JSZip();

        for (const entry of filesInTildaBuildDir) {
            if (entry.isDirectory()) {
                continue;
            }

            const fileAbsolutePath = path.join(entry.parentPath ?? entry.path, entry.name);
            // Get path relative to tildaBuildDirPath (not tildaDirPath) to avoid including 'build/' in the zip path
            const relativePath = path.relative(tildaBuildDirPath, fileAbsolutePath);

            if (entry.isSymbolicLink()) {
                const [errorWithReadingLink, linkTarget] = await safely(fs.readlink(fileAbsolutePath));
                if (errorWithReadingLink) {
                    this.error(`Error reading symbolic link: ${errorWithReadingLink.message}`);
                }

                zip.file(relativePath, Buffer.from(linkTarget), {
                    unixPermissions: 0o12_0755,
                });
                continue;
            }

            const [errorWithReadingFile, fileContents] = await safely(fs.readFile(fileAbsolutePath));
            if (errorWithReadingFile) {
                this.error(`Error reading file to add to zip: ${errorWithReadingFile.message}`);
            }

            zip.file(relativePath, fileContents);
        }
        zip.file('metadata.json', Buffer.from(JSON.stringify(buildMetadata, null, 2)));

        const [errorWithWritingZipFile, zipBuffer] = await safely(zip.generateAsync({
            platform: 'UNIX',
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 9,
            }
        }));
        if (errorWithWritingZipFile) {
            this.error(`Error writing zip file: ${errorWithWritingZipFile.message}`);
        }

        const zipFilePath = path.join(tildaBuildDirPath, 'package.zip');
        const [errorWithWritingZipBuffer] = await safely(fs.writeFile(zipFilePath, zipBuffer));
        if (errorWithWritingZipBuffer) {
            this.error(`Error writing zip buffer: ${errorWithWritingZipBuffer.message}`);
        }

        this.log('Build complete');
    }
}
