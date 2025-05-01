import { Flags } from '@oclif/core'
import { infer as ZInfer } from 'zod'
import { type Stats } from "node:fs";
import * as path from 'node:path';
import * as cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import JSZip from "jszip";
import { safely } from "../../../lib/utils.js";
import { BaseCommand } from "../../../baseCommand.js";
import { InlineRoutingConfigSchema, TildaDeploymentMetadataSchema } from '../../../lib/schemas.js';

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
            required: false,
            multiple: true,
        }),
        underscoreNamedStaticDir: Flags.string({
            description: 'Relative path to static files directory that will be served from relative path with "." replaced with "_"',
            required: false
        }),
        skipAppBuild: Flags.boolean({
            description: 'Skip running build command',
            default: false,
        }),
        routingConfigJson: Flags.string({
            description: 'Inline JSON of routing config',
            required: false,
            default: '{"routes":[]}'
        }),
        preserveStage: Flags.boolean({
            description: 'Keep the staging directory (.tilda/stage) intact',
            required: false,
            default: false
        }),
        framework: Flags.string({
            description: 'Framework name',
            required: false,
        }),
        frameworkVersion: Flags.string({
            description: 'Framework version',
            required: false,
        }),
    }

    async run(): Promise<void> {
        const { flags } = await this.parse(BuildStatic)

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

        // Process static directories
        const rootStaticDirPaths = flags.rootStaticDir?.map(dir => path.resolve(dir)) || [];
        const underscoreNamedStaticDirPath = flags.underscoreNamedStaticDir ? path.resolve(flags.underscoreNamedStaticDir) : undefined;

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

        if (!flags.skipAppBuild) {
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
        }

        this.log('Building Tilda package');

        // Check and validate static directories
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
        } else if (!underscoreNamedStaticDirPath) {
            this.error('At least one static directory (rootStaticDir or underscoreNamedStaticDir) must be provided');
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

        // create directories for static files and debug files
        const tildaBuildStaticDirPath = path.join(tildaBuildDirPath, 'static');
        const tildaDebugDirPath = path.join(tildaBuildDirPath, 'debug');

        await fs.mkdir(tildaBuildStaticDirPath, { recursive: true });

        // Copy static directories
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

        // Create debug directory
        await fs.mkdir(tildaDebugDirPath, { recursive: true });

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

        // Parse routing config
        const [errorWithParsingInlineConfigAsJson, jsonOfInlineConfig] = await safely(() => JSON.parse(flags.routingConfigJson));
        if (errorWithParsingInlineConfigAsJson) {
            this.error(`Error parsing inline routing config: ${errorWithParsingInlineConfigAsJson.message}`);
        }

        const [errorWithParsingInlineRoutingConfig, inlineRoutingConfig] = await safely(InlineRoutingConfigSchema.parseAsync(jsonOfInlineConfig))
        if (errorWithParsingInlineRoutingConfig) {
            this.error(`Error parsing inline routing config: ${errorWithParsingInlineRoutingConfig.message}`);
        }

        // Read files in the .tilda/build directory
        const [errorWithReadingFiles, filesInTildaBuildDir] = await safely(fs.readdir(tildaBuildDirPath, {
            recursive: true,
            withFileTypes: true,
        }));
        if (errorWithReadingFiles) {
            this.error(`Error reading files in .tilda/build directory: ${errorWithReadingFiles.message}`);
        }

        // Generate static file routes
        const staticFileRoutes = filesInTildaBuildDir
            .filter((entry) => {
                const fileAbsolutePath = path.join(entry.parentPath ?? entry.path, entry.name);
                const relativePath = path.relative(tildaBuildDirPath, fileAbsolutePath);
                return entry.isFile() && relativePath.startsWith('static/');
            })
            .map((entry): ZInfer<typeof TildaDeploymentMetadataSchema>['v2']['routes'][0] => {
                const fileAbsolutePath = path.join(entry.parentPath ?? entry.path, entry.name);
                const pathRelativeToStaticDir = path.relative(path.join(tildaBuildDirPath, 'static'), fileAbsolutePath);

                const routePath = path.join('/', pathRelativeToStaticDir);

                if (path.basename(fileAbsolutePath) === 'index.html') {
                    return {
                        criteria: {
                            path: {
                                oneOf: Array.from(new Set([routePath, routePath.replace(/\/index\.html$/, ''), routePath.replace(/\/index\.html$/, '/')].filter(Boolean))),
                            }
                        },
                        action: {
                            origin: 'static',
                            originPath: routePath,
                        }
                    };
                }

                if (path.extname(fileAbsolutePath) === '.html') {
                    return {
                        criteria: {
                            path: {
                                oneOf: Array.from(new Set([routePath, routePath.replace(/\.html$/, '')].filter(Boolean))),
                            }
                        },
                        action: {
                            origin: 'static',
                            originPath: routePath,
                        }
                    };
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
                };
            });

        // Prepare deployment metadata
        const buildMetadata: ZInfer<typeof TildaDeploymentMetadataSchema> = {
            v2: {
                nodeJsVersion: process.version,
                routes: [
                    ...staticFileRoutes,
                    ...inlineRoutingConfig.routes,
                ],
                framework: flags.framework,
                frameworkVersion: flags.frameworkVersion,
            }
        };

        // Write metadata to .tilda/build directory
        const metadataPath = path.join(tildaBuildDirPath, 'metadata.json');
        const [errorWithWritingBuildMetadata] = await safely(fs.writeFile(metadataPath, JSON.stringify(buildMetadata, null, 2)));
        if (errorWithWritingBuildMetadata) {
            this.error(`Error writing build metadata: ${errorWithWritingBuildMetadata.message}`);
        }

        this.log('Tilda package built');

        // Create package.zip in .tilda/build directory
        const zip = new JSZip();

        // Add all files from .tilda/build to the zip
        for (const entry of filesInTildaBuildDir) {
            if (entry.isDirectory()) {
                continue;
            }

            const fileAbsolutePath = path.join(entry.parentPath ?? entry.path, entry.name);
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

        // Add metadata.json to the root of the zip
        zip.file('metadata.json', Buffer.from(JSON.stringify(buildMetadata, null, 2)));

        // Generate the zip file
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

        // Write the zip file to .tilda/build/package.zip
        const zipFilePath = path.join(tildaBuildDirPath, 'package.zip');
        const [errorWithWritingZipBuffer] = await safely(fs.writeFile(zipFilePath, zipBuffer));
        if (errorWithWritingZipBuffer) {
            this.error(`Error writing zip buffer: ${errorWithWritingZipBuffer.message}`);
        }

        this.log('Static build complete');
    }
}
