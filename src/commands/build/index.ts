import { Flags } from '@oclif/core'
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import JSZip from "jszip";
import { infer as ZInfer } from 'zod'
import { nodeFileTrace } from '@vercel/nft';
import { safely } from "../../lib/utils.js";
import { BaseCommand } from "../../baseCommand.js";
import { TildaDeploymentMetadataSchema } from '../../lib/schemas.js';

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

        // remove the .tilda directory if it exists
        const [errorWithRemovingTildaDir] = await safely(fs.rm(path.join(projectDirPath, '.tilda'), {
            recursive: true,
            force: true
        }))
        if (errorWithRemovingTildaDir) {
            this.error(`Error removing .tilda directory: ${errorWithRemovingTildaDir.message}`);
        }

        // trace the server entry file
        const [errorWithTracingEntryFile, serverFileTrace] = await safely(nodeFileTrace([serverEntryFilePath], {
            base: projectDirPath,
            processCwd: projectDirPath,
        }));
        if (errorWithTracingEntryFile) {
            this.error(`Error tracing server entry file: ${errorWithTracingEntryFile.message}`);
        }

        const tildaBuildStaticDirPath = path.join(projectDirPath, '.tilda', 'static');
        const tildaBuildComputeDirPath = path.join(projectDirPath, '.tilda', 'compute', path.basename(serverDirPath));
        const tildaDebugDirPath = path.join(projectDirPath, '.tilda', 'debug');

        if (rootStaticDirPaths.length) {
            if (rootStaticDirPaths.length > 1) {
                this.log('Multiple root static files directories specified. Some files may be overwritten.');
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

        const tildaDirPath = path.join(projectDirPath, '.tilda');

        const [errorWithReadingFiles, filesInTildaDir] = await safely(fs.readdir(path.join(projectDirPath, '.tilda'), {
            recursive: true,
            withFileTypes: true,
        }));
        if (errorWithReadingFiles) {
            this.error(`Error reading files in .tilda directory: ${errorWithReadingFiles.message}`);
        }

        const computeFiles = filesInTildaDir
            .filter((entry) => {
                const fileAbsolutePath = path.join(entry.parentPath ?? entry.path, entry.name);
                const relativePath = path.relative(tildaDirPath, fileAbsolutePath);
                return entry.isFile() && relativePath.startsWith('compute/');
            });

        const staticFiles = filesInTildaDir
            .filter((entry) => {
                const fileAbsolutePath = path.join(entry.parentPath ?? entry.path, entry.name);
                const relativePath = path.relative(tildaDirPath, fileAbsolutePath);
                return entry.isFile() && relativePath.startsWith('static/');
            });

        const buildMetadata: ZInfer<typeof TildaDeploymentMetadataSchema> = {
            v2: {
                nodeJsVersion: process.version,
                serverEntryFilePathRelativeToComputeDir: path.join(path.basename(serverDirPath), path.relative(serverDirPath, serverEntryFilePath)),
                routes: [
                    ...(staticFiles
                        .map((entry): ZInfer<typeof TildaDeploymentMetadataSchema>['v2']['routes'][0] => {
                            const fileAbsolutePath = path.join(entry.parentPath ?? entry.path, entry.name);
                            const pathRelativeToStaticDir = path.relative(path.join(tildaDirPath, 'static'), fileAbsolutePath);

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
                                }
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
                                }
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
                            }
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
                    }] : []
                    )
                ],
            }
        }

        // write build metadata to .tilda directory
        const metadataFilePath = path.join(tildaDirPath, 'metadata.json');

        this.debug('metadataFilePath', metadataFilePath);

        const [errorWithWritingMetadata] = await safely(fs.writeFile(metadataFilePath, JSON.stringify(buildMetadata, null, 2)));
        if (errorWithWritingMetadata) {
            this.error(`Error writing build metadata: ${errorWithWritingMetadata.message}`);
        }

        // zip everything in .tilda directory
        const zip = new JSZip();

        for (const entry of filesInTildaDir) {
            if (entry.isDirectory()) {
                continue;
            }

            const fileAbsolutePath = path.join(entry.parentPath ?? entry.path, entry.name);
            const relativePath = path.relative(tildaDirPath, fileAbsolutePath);

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

        const zipFilePath = path.join(tildaDirPath, 'package.zip');
        const [errorWithWritingZipBuffer] = await safely(fs.writeFile(zipFilePath, zipBuffer));
        if (errorWithWritingZipBuffer) {
            this.error(`Error writing zip buffer: ${errorWithWritingZipBuffer.message}`);
        }

        this.log('Build complete');
    }
}
