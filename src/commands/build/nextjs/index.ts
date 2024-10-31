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

    private configFilePaths: undefined | { backup: string, config: string };

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

        const isConfigFileAModule = existingConfigFileInfo.filePath.endsWith('.mjs') || packageJson.type === 'module';

        const backupConfigFilePath = configFilePath + '.tildaBackup';
        // check if backup config file exists
        const [errorWithCheckingBackupConfigFileStats, backupConfigFileStats] = await safely<Stats, {
            code?: string
            message?: string
        }>(fs.stat(backupConfigFilePath));
        if (errorWithCheckingBackupConfigFileStats && errorWithCheckingBackupConfigFileStats.code !== 'ENOENT') {
            this.error(`Error checking backup config file: ${errorWithCheckingBackupConfigFileStats.message}`);
        }
        if (backupConfigFileStats) {
            this.error(format(`Next.js config backup file already exists: ${backupConfigFilePath}.`, 'Please restore', configFilePath, 'manually, delete the backup file and run the build command again.'));
        }

        // read the config file
        const [errorWithImportingConfig, importedConfigExports] = await safely(import(configFilePath));
        if (errorWithImportingConfig) {
            this.error(`Error reading config file: ${errorWithImportingConfig.message}`);
        }

        const nextJsConfig = importedConfigExports.default;
        if (!nextJsConfig) {
            this.error('Config file must export a default object');
        }
        this.debug(format('User config', nextJsConfig));

        nextJsConfig.output = 'standalone';
        nextJsConfig.experimental = nextJsConfig.experimental || {};

        const nextJsCaceHandleFileRelativePath = '@tildacloud/cli/dist/nextJsCacheHandler' + (isConfigFileAModule ? 'mjs' : 'cjs');
        const [, cacheHandlerLocalPath] = await safely(() => resolveFrom(projectDirPath, nextJsCaceHandleFileRelativePath));
        const [, cacheHandlerGlobalPath] = await safely(() => resolveGlobal(nextJsCaceHandleFileRelativePath));
        const currentFilePath = new URL(import.meta.url).pathname;
        // find nearest node_modules in current file's path
        const currentFileNodeModulesDirResult = this.findClosestNodeModulesDir(currentFilePath);
        const currentFilePackageDir = currentFileNodeModulesDirResult ? path.dirname(currentFileNodeModulesDirResult) : '';
        const [, currentFileRelativeCacheHandlerPath] = await safely(() => resolveFrom(currentFilePackageDir, nextJsCaceHandleFileRelativePath));

        const chosenNextJsCacheHandlerPath = cacheHandlerLocalPath || cacheHandlerGlobalPath || currentFileRelativeCacheHandlerPath;
        if (!chosenNextJsCacheHandlerPath) {
            this.error(format('Cache handler not found:', nextJsCaceHandleFileRelativePath));
        }
        this.debug(format('Chosen cache handler:', chosenNextJsCacheHandlerPath));

        // copy nextJsCacheHandler to projectDirPath/.node_modules/.tilda/nextJsCacheHandler.{mjs,cjs}
        const nextJsCacheHandlerDir = path.resolve(projectDirPath, 'node_modules/.tilda');
        const cacheHandlerFileName = path.basename(chosenNextJsCacheHandlerPath);
        const nextJsCacheHandlerFilePath = path.resolve(nextJsCacheHandlerDir, cacheHandlerFileName);
        const [errorWithCreatingCacheHandlerDir] = await safely(fs.mkdir(nextJsCacheHandlerDir, {recursive: true}));
        if (errorWithCreatingCacheHandlerDir) {
            this.error(`Error creating node_modules/.tilda directory: ${errorWithCreatingCacheHandlerDir.message}`);
        }
        const [errorWithCopyingCacheHandlerFile] = await safely(fs.copyFile(chosenNextJsCacheHandlerPath, nextJsCacheHandlerFilePath));
        if (errorWithCopyingCacheHandlerFile) {
            this.error(`Error copying cache handler file: ${errorWithCopyingCacheHandlerFile.message}`);
        }

        // Apply Next.js 14.1 + related config changes
        if (nextJsMajorVersion === 14 && nextJsMinorVersion >= 1) {
            nextJsConfig.cacheHandler = nextJsCacheHandlerFilePath;
            nextJsConfig.experimental.swrDelta = 60 * 60 * 24 * 30 * 12; // 1 year
        } else if (nextJsMajorVersion === 13 || (nextJsMajorVersion === 14 && nextJsMinorVersion < 1)) {
            nextJsConfig.experimental.incrementalCacheHandlerPath = nextJsCacheHandlerFilePath;
        }

        this.debug(format('Modified config:', nextJsConfig));

        // copy the backup config file to a new file with .backup extension
        const [errorWithCopyingConfigFile] = await safely(fs.copyFile(configFilePath, backupConfigFilePath));
        if (errorWithCopyingConfigFile) {
            this.error(`Error copying config file: ${errorWithCopyingConfigFile.message}`);
        }
        this.configFilePaths = {backup: backupConfigFilePath, config: configFilePath};

        const tildaConfigFileComment = '// This file is automatically generated by Tilda. If it is not removed automatically, please remove this file and restore Next.js config file with .backup extension in its place.';

        // write the modified config file
        const [errorWithWritingConfigFile] = await safely(fs.writeFile(configFilePath, isConfigFileAModule ? `${tildaConfigFileComment}\nexport default ${JSON.stringify(nextJsConfig, null, 2)};` : `${tildaConfigFileComment}\nmodule.exports = ${JSON.stringify(nextJsConfig, null, 2)};`));
        if (errorWithWritingConfigFile) {
            this.error(`Error writing config file: ${errorWithWritingConfigFile.message}`);
        }

        this.log('User config file backed up:', path.relative(projectDirPath, configFilePath), '→', path.relative(projectDirPath, backupConfigFilePath))
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
    }

    async catch(error: CommandError) {
        await this.restoreConfigFile()
        throw error;
    }

    async restoreConfigFile() {
        if (this.configFilePaths) {
            const configFileDir = path.dirname(this.configFilePaths.config);
            // restore the backup config file
            const [errorWithRestoringConfigFile] = await safely(fs.copyFile(this.configFilePaths.backup, this.configFilePaths.config));
            if (errorWithRestoringConfigFile) {
                this.error(`Error restoring config file: ${errorWithRestoringConfigFile.message}`);
            }
            // remove the backup reference config file
            const [errorWithRemovingBackupConfigFile] = await safely(fs.rm(this.configFilePaths.backup));
            if (errorWithRemovingBackupConfigFile) {
                this.error(`Error removing backup config file: ${errorWithRemovingBackupConfigFile.message}`);
            }

            this.log('Restored backup config file:', path.relative(configFileDir, this.configFilePaths.backup), '→', path.relative(configFileDir, this.configFilePaths.config));
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
