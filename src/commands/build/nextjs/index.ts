import {Flags} from '@oclif/core'
import {format} from "node:util";
import * as path from 'node:path';
import * as cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import {safely} from "../../../lib/utils.js";
import {BaseCommand} from "../../../baseCommand.js";

const CONFIG_FILES = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
]

export default class Build extends BaseCommand<typeof Build> {
    static description = 'Build the application'

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

    async run(): Promise<void> {
        const {args, flags} = await this.parse(Build)

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

        const isConfigFileAModule = existingConfigFileInfo.filePath.endsWith('.mjs') || packageJson.type === 'module';

        // read the config file
        const [errorWithImportingConfig, importedConfigExports] = await safely(import(configFilePath));
        if (errorWithImportingConfig) {
            this.error(`Error reading config file: ${errorWithImportingConfig.message}`);
        }

        const nextJsConfig = importedConfigExports.default;
        if (!nextJsConfig) {
            this.error('Config file must export a default object');
        }
        this.log(format('User config', nextJsConfig));

        nextJsConfig.output = 'standalone';
        nextJsConfig.experimental = nextJsConfig.experimental || (nextJsConfig.experimental = {});
        nextJsConfig.cacheHandler = path.resolve(projectDirPath, 'node_modules/@tildacloud/cli/dist/nextJsCacheHandler.' + (isConfigFileAModule ? 'mjs' : 'cjs'));
        nextJsConfig.experimental.swrDelta = 60 * 60 * 24 * 7; // 1 week

        this.log('Modified config:', nextJsConfig);

        // copy the original config file to a new file with .original extension
        const originalConfigFilePath = configFilePath + '.original';
        const [errorWithCopyingConfigFile] = await safely(fs.copyFile(configFilePath, originalConfigFilePath));
        if (errorWithCopyingConfigFile) {
            this.error(`Error copying config file: ${errorWithCopyingConfigFile.message}`);
        }

        const tildaConfigFileComment = '// This file is automatically generated by Tilda. If it is not removed automatically, please remove this file and restore Next.js config file with .original extension in its place.';

        // write the modified config file
        const [errorWithWritingConfigFile] = await safely(fs.writeFile(configFilePath, isConfigFileAModule ? `${tildaConfigFileComment}\nexport default ${JSON.stringify(nextJsConfig, null, 2)};` : `${tildaConfigFileComment}\nmodule.exports = ${JSON.stringify(nextJsConfig, null, 2)};`));
        if (errorWithWritingConfigFile) {
            this.error(`Error writing config file: ${errorWithWritingConfigFile.message}`);
        }

        this.log('Wrote modified config file:', configFilePath);

        const buildCommand = flags.buildCommand;
        this.log('Running build command:', JSON.stringify(buildCommand), 'in', projectDirPath);

        const commandParts = buildCommand.split(' ');
        if (commandParts.length === 0) {
            this.error('Invalid build command');
        }

        const program = commandParts[0];
        const commandArgs = commandParts.slice(1);

        const [errorWithBuildCommand] = await safely(() => cp.execFileSync(program, commandArgs, {
            cwd: projectDirPath,
            stdio: 'inherit',
            env: {...process.env}
        }));

        // restore the original config file
        const [errorWithRestoringConfigFile] = await safely(fs.copyFile(originalConfigFilePath, configFilePath));
        if (errorWithRestoringConfigFile) {
            this.error(`Error restoring config file: ${errorWithRestoringConfigFile.message}`);
        }
        // remove the original reference config file
        const [errorWithRemovingOriginalConfigFile] = await safely(fs.rm(originalConfigFilePath));
        if (errorWithRemovingOriginalConfigFile) {
            this.error(`Error removing original config file: ${errorWithRemovingOriginalConfigFile.message}`);
        }

        this.log('Restored original config file:', configFilePath);

        if (errorWithBuildCommand) {
            this.error(`Error running build command: ${errorWithBuildCommand.message}`);
        }

        this.log('Build complete');
    }
}
