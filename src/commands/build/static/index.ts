import { Flags } from '@oclif/core'
import { infer as ZInfer } from 'zod'
import { type Stats } from "node:fs";
import * as path from 'node:path';
import * as cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import JSZip from "jszip";
import { safely } from "../../../lib/utils.js";
import { BaseCommand } from "../../../baseCommand.js";
import { TildaDeploymentMetadataSchema } from '../../../lib/schemas.js';

const LOCK_FILES = [
    'package-lock.json',
    'pnpm-lock.yaml',
] as const;

export default class BuildStatic extends BaseCommand<typeof BuildStatic> {
    static description = 'Build a static website'

    static flags = {
        projectDir: Flags.string({
            description: 'Relative path project directory',
            required: true,
            default: process.cwd()
        }),
        buildCommand: Flags.string({
            description: 'Application build command',
            required: true,
            default: 'npm run build'
        }),
        rootStaticDir: Flags.string({
            description: 'Relative path to static files directory that will be served from root (/)',
            required: true,
        }),
    }

    private configFilePaths: undefined | { original: string, config: string };

    async run(): Promise<void> {
        const { args, flags } = await this.parse(BuildStatic)

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

        const packageJsonFilePath = path.resolve(projectDirPath, 'package.json');
        const [errorWithReadingPackageJson, packageJsonText] = await safely(fs.readFile(packageJsonFilePath, 'utf8'));
        if (errorWithReadingPackageJson) {
            this.error(`Error reading package.json: ${errorWithReadingPackageJson.message}`);
        }

        const [errorWithParsingPackageJson, packageJson] = await safely(() => JSON.parse(packageJsonText));
        if (errorWithParsingPackageJson) {
            this.error(`Error parsing package.json: ${errorWithParsingPackageJson.message}`);
        }

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

        this.log('Application build complete');

        this.log('Building Tilda package');

        const rootStaticDirPath = path.resolve(flags.rootStaticDir);

        // check if root static dir exists
        const [errorWithRootStaticDirStats, rootStaticDirStats] = await safely<Stats, {
            code?: string,
            message?: string
        }>(fs.stat(rootStaticDirPath));
        if (errorWithRootStaticDirStats && errorWithRootStaticDirStats.code !== 'ENOENT') {
            this.error(`Error checking root static dir: ${errorWithRootStaticDirStats.message}`);
        }
        if (!rootStaticDirStats?.isDirectory()) {
            this.error(`Root static dir is not a valid directory: ${rootStaticDirPath}`);
        }

        const tildaBuildStaticDirPath = path.join(projectDirPath, '.tilda', 'static');
        const tildaDebugDirPath = path.join(projectDirPath, '.tilda', 'debug');
        const tildaDirPath = path.join(projectDirPath, '.tilda');

        // remove the tilda dir if it exists
        await safely(fs.rm(tildaDirPath, {recursive: true, force: true}));

        // create the tilda dir
        const [errorWithCreatingTildaDir] = await safely(fs.mkdir(tildaDirPath, {
            recursive: true,
        }));
        if (errorWithCreatingTildaDir) {
            this.error(`Error creating tilda dir: ${errorWithCreatingTildaDir.message}`);
        }

        this.debug('Copying root static files directories');
        const [errorWithCopyingStaticFilesDir] = await safely(fs.cp(rootStaticDirPath, tildaBuildStaticDirPath, {
            recursive: true,
            verbatimSymlinks: true,
        }));
        if (errorWithCopyingStaticFilesDir) {
            this.error(`Error copying static files directory: ${errorWithCopyingStaticFilesDir.message}`);
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

        const [errorWithReadingFiles, filesInTildaDir] = await safely(fs.readdir(path.join(projectDirPath, '.tilda'), {
            recursive: true,
            withFileTypes: true,
        }));
        if (errorWithReadingFiles) {
            this.error(`Error reading files in .tilda directory: ${errorWithReadingFiles.message}`);
        }

        const buildMetadata: ZInfer<typeof TildaDeploymentMetadataSchema> = {
            v2: {
                nodeJsVersion: process.version,
                routes: [
                    ...(filesInTildaDir
                        .filter((entry) => {
                            const fileAbsolutePath = path.join(entry.parentPath ?? entry.path, entry.name);
                            const relativePath = path.relative(tildaDirPath, fileAbsolutePath);
                            return entry.isFile() && relativePath.startsWith('static/');
                        })
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
                ],
            }
        };
        const [errorWithWritingBuildMetadata] = await safely(fs.writeFile(path.join(tildaDirPath, 'metadata.json'), JSON.stringify(buildMetadata, null, 2)));
        if (errorWithWritingBuildMetadata) {
            this.error(`Error writing build metadata: ${errorWithWritingBuildMetadata.message}`);
        }

        this.log('Tilda package built');

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
    }
}
