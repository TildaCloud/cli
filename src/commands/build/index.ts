import {Args, Command, Flags} from '@oclif/core'
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {nodeFileTrace} from '@vercel/nft';
import AdmnZip from 'adm-zip';
import {safely} from "../../lib/utils.js";

export default class Hello extends Command {
    static description = 'Build the application'

    static flags = {
        serverDir: Flags.string({description: 'Relative path to server files directory', required: true}),
        staticDir: Flags.string({description: 'Relative path to static files directory', required: true}),
        projectDir: Flags.string({description: 'Relative path project directory', required: true}),
        serverEntryFile: Flags.string({description: 'Relative path to server entry file', required: true}),
    }

    async run(): Promise<void> {
        const {args, flags} = await this.parse(Hello)

        const projectDirPath = path.resolve(flags.projectDir);
        const serverDirPath = path.resolve(flags.serverDir);
        const staticDirPath = path.resolve(flags.staticDir);
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

        // ensure the static directory exists
        const [errorWithCheckingStaticDirStats, staticDirStats] = await safely(fs.stat(staticDirPath));
        if (errorWithCheckingStaticDirStats) {
            this.error(`Error checking static directory: ${errorWithCheckingStaticDirStats.message}`);
        }
        if (!staticDirStats.isDirectory()) {
            this.error(`Static directory does not exist: ${staticDirPath}`);
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
        const tildaBuildComputeDirPath = path.join(projectDirPath, '.tilda', 'compute');
        const tildaDebugDirPath = path.join(projectDirPath, '.tilda', 'debug');

        this.debug('Copying static files directory');
        const [errorWithCopyingStaticFilesDir] = await safely(fs.cp(staticDirPath, tildaBuildStaticDirPath, {recursive: true}));
        if (errorWithCopyingStaticFilesDir) {
            this.error(`Error copying static files directory: ${errorWithCopyingStaticFilesDir.message}`);
        }
        this.debug('Copying server files directory');
        const [errorWithCopyingServerFilesDir] = await safely(fs.cp(serverDirPath, tildaBuildComputeDirPath, {recursive: true}));
        if (errorWithCopyingServerFilesDir) {
            this.error(`Error copying server files directory: ${errorWithCopyingServerFilesDir.message}`);
        }

        const staticDirPathRelativeToProjectDir = path.relative(projectDirPath, staticDirPath);
        const serverDirPathRelativeToProjectDir = path.relative(projectDirPath, serverDirPath);

        const entryFileDependencies = new Set<string>();
        for (const dependency of serverFileTrace.fileList) {
            if (dependency.startsWith(staticDirPathRelativeToProjectDir + '/')) {
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
            const [errorWithCopyingADependency] = await safely(fs.cp(dependencyAbsolutePath, destinationAbsolutePath));
            if (errorWithCopyingADependency) {
                this.error(`Error copying a dependency (${dependencyAbsolutePath}): ${errorWithCopyingADependency.message}`);
            }
        }

        this.debug('Copying debug files');
        const [errorWithCopyingDebugServerFiles] = await safely(fs.cp(serverDirPath, path.join(tildaDebugDirPath, path.basename(serverDirPath)), {recursive: true}));
        if (errorWithCopyingDebugServerFiles) {
            this.error(`Error copying debug files for server: ${errorWithCopyingDebugServerFiles.message}`);
        }
        const [errorWithCopyingDebugPackageJson] = await safely(fs.cp(path.join(projectDirPath, 'package.json'), path.join(tildaDebugDirPath, 'package.json')));
        if (errorWithCopyingDebugPackageJson) {
            this.error(`Error copying debug package.json: ${errorWithCopyingDebugPackageJson.message}`);
        }

        const buildMetaData: BuildMetadata = {
            v1: {
                serverEntryFilePathRelativeToServerDir: path.relative(serverDirPath, serverEntryFilePath),
                nodeJsVersion: process.version,
            }
        }

        const tildaDirPath = path.join(projectDirPath, '.tilda');

        // write build metadata to .tilda directory
        const metadataFilePath = path.join(tildaDirPath, 'metadata.json');

        console.log('metadataFilePath', metadataFilePath);

        const [errorWithWritingMetadata] = await safely(fs.writeFile(metadataFilePath, JSON.stringify(buildMetaData, null, 2)));
        if (errorWithWritingMetadata) {
            this.error(`Error writing build metadata: ${errorWithWritingMetadata.message}`);
        }

        // zip everything in .tilda directory
        const zip = new AdmnZip();
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

            const fileAbsolutePath = path.join(entry.parentPath, entry.name);
            const relativePath = path.relative(tildaDirPath, fileAbsolutePath);
            const [errorWithReadingFile, fileContents] = await safely(fs.readFile(fileAbsolutePath));
            if (errorWithReadingFile) {
                this.error(`Error reading file to add to zip: ${errorWithReadingFile.message}`);
            }

            zip.addFile(relativePath, fileContents);
        }

        const zipFilePath = path.join(tildaDirPath, 'package.zip');
        const [errorWithWritingZipFile] = await safely(zip.writeZipPromise(zipFilePath));
        if (errorWithWritingZipFile) {
            this.error(`Error writing zip file: ${errorWithWritingZipFile.message}`);
        }

        this.log('Build complete');
    }
}

type BuildMetadata = {
    v1: {
        serverEntryFilePathRelativeToServerDir: string
        nodeJsVersion: string
    }
}
