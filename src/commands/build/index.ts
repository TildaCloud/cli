import {Flags} from '@oclif/core'
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import JSZip from "jszip";
import {nodeFileTrace} from '@vercel/nft';
import {safely} from "../../lib/utils.js";
import {BaseCommand} from "../../baseCommand.js";

const LOCK_FILES = [
    'package-lock.json',
    'pnpm-lock.yaml',
] as const;

export default class Build extends BaseCommand<typeof Build> {
    static description = 'Build the application'

    static flags = {
        serverDir: Flags.string({description: 'Relative path to server files directory', required: true}),
        rootStaticDir: Flags.string({
            description: 'Relative path to static files directory that will be served from root (/)',
            required: false
        }),
        underscoreNamedStaticDir: Flags.string({
            description: 'Relative path to static files directory that will be served from relative path with "." replaced with "_"',
            required: false
        }),
        projectDir: Flags.string({description: 'Relative path project directory', required: true}),
        serverEntryFile: Flags.string({description: 'Relative path to server entry file', required: true}),
    }

    async run(): Promise<void> {
        const {args, flags} = await this.parse(Build)

        const projectDirPath = path.resolve(flags.projectDir);
        const serverDirPath = path.resolve(flags.serverDir);
        const rootStaticDirPath = flags.rootStaticDir ? path.resolve(flags.rootStaticDir) : undefined;
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

        if (rootStaticDirPath) {
            // ensure the root static directory exists
            const [errorWithCheckingStaticDirStats, staticDirStats] = await safely(fs.stat(rootStaticDirPath));
            if (errorWithCheckingStaticDirStats) {
                this.error(`Error checking static directory: ${errorWithCheckingStaticDirStats.message}`);
            }
            if (!staticDirStats.isDirectory()) {
                this.error(`Static directory does not exist: ${rootStaticDirPath}`);
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

        if (rootStaticDirPath) {
            this.debug('Copying root static files directories');
            const [errorWithCopyingStaticFilesDir] = await safely(fs.cp(rootStaticDirPath, tildaBuildStaticDirPath, {
                recursive: true,
                verbatimSymlinks: true,
            }));
            if (errorWithCopyingStaticFilesDir) {
                this.error(`Error copying static files directory: ${errorWithCopyingStaticFilesDir.message}`);
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

        const staticDirPathsRelativeToProjectDir = rootStaticDirPath ? path.relative(projectDirPath, rootStaticDirPath) : undefined;
        const underscoreNamedStaticDirPathRelativeToProjectDir = underscoreNamedStaticDirPath ? path.relative(projectDirPath, underscoreNamedStaticDirPath) : underscoreNamedStaticDirPath;
        const serverDirPathRelativeToProjectDir = path.relative(projectDirPath, serverDirPath);

        const entryFileDependencies = new Set<string>();
        for (const dependency of serverFileTrace.fileList) {
            if (underscoreNamedStaticDirPathRelativeToProjectDir && dependency.startsWith(underscoreNamedStaticDirPathRelativeToProjectDir + '/')) {
                continue;
            }
            if (staticDirPathsRelativeToProjectDir && dependency.startsWith(staticDirPathsRelativeToProjectDir + '/')) {
                continue;
            }
            if (dependency.startsWith(serverDirPathRelativeToProjectDir + '/')) {
                continue;
            }
            if (dependency === path.relative(projectDirPath, path.join(projectDirPath, 'package.json'))) {
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

        const buildMetaData: BuildMetadata = {
            v1: {
                serverEntryFilePathRelativeToComputeDir: path.join(path.basename(serverDirPath), path.relative(serverDirPath, serverEntryFilePath)),
                nodeJsVersion: process.version,
            }
        }

        const tildaDirPath = path.join(projectDirPath, '.tilda');

        // write build metadata to .tilda directory
        const metadataFilePath = path.join(tildaDirPath, 'metadata.json');

        this.debug('metadataFilePath', metadataFilePath);

        const [errorWithWritingMetadata] = await safely(fs.writeFile(metadataFilePath, JSON.stringify(buildMetaData, null, 2)));
        if (errorWithWritingMetadata) {
            this.error(`Error writing build metadata: ${errorWithWritingMetadata.message}`);
        }

        // zip everything in .tilda directory
        const zip = new JSZip();
        const [errorWithReadingFiles, filesInTildaDir] = await safely(fs.readdir(path.join(projectDirPath, '.tilda'), {
            recursive: true,
            withFileTypes: true,
        }));
        if (errorWithReadingFiles) {
            this.error(`Error reading files in .tilda directory: ${errorWithReadingFiles.message}`);
        }

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

type BuildMetadata = {
    v1: {
        nodeJsVersion: string
        serverEntryFilePathRelativeToComputeDir: string
    }
}
