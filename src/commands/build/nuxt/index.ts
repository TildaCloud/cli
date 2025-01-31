import { Flags } from '@oclif/core'
import { type Stats } from "node:fs";
import * as path from 'node:path';
import * as cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import { CommandError } from "@oclif/core/interfaces";
import { safely } from "../../../lib/utils.js";
import { BaseCommand } from "../../../baseCommand.js";
import BuildCommand from '../index.js'

export default class BuildNuxt extends BaseCommand<typeof BuildNuxt> {
    static description = 'Build Nuxt project'

    static flags = {
        projectDir: Flags.string({
            description: 'Relative path project directory',
            required: true,
            default: process.cwd()
        }),
        buildCommand: Flags.string({
            description: 'Nuxt build command',
            required: true,
            default: 'npm run build'
        }),
    }

    async run(): Promise<void> {
        const { flags } = await this.parse(BuildNuxt)

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

        const [errorWithChangingDir] = await safely(() => process.chdir(projectDirPath));
        if (errorWithChangingDir) {
            this.error(`Error changing directory: ${errorWithChangingDir.message}`);
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

        this.log('Nuxt build complete');

        this.log('Building Tilda package');

        const serverDir = path.resolve(projectDirPath, '.output/server');
        const serverEntryFile = path.resolve(serverDir, 'index.mjs');
        const staticDir = path.resolve(projectDirPath, '.output/public');

        // Check if static dir exists
        const [errorWithStaticDirStats, staticDirStats] = await safely<Stats, {
            code?: string,
            message?: string
        }>(fs.stat(staticDir));
        if (errorWithStaticDirStats && errorWithStaticDirStats.code !== 'ENOENT') {
            this.error(`Error checking static dir: ${errorWithStaticDirStats.message}`);
        }

        // Copy nitro.json as debug file
        const nitroJsonPath = path.resolve(projectDirPath, '.output/nitro.json');
        const [errorWithNitroJsonStats] = await safely(fs.stat(nitroJsonPath));
        if (!errorWithNitroJsonStats) {
            const debugDir = path.resolve(projectDirPath, '.output/debug');
            await safely(fs.mkdir(debugDir, { recursive: true }));
            await safely(fs.copyFile(nitroJsonPath, path.resolve(debugDir, 'nitro.json')));
        }

        await BuildCommand.run([
            '--projectDir', projectDirPath,
            '--serverDir', serverDir,
            '--serverEntryFile', serverEntryFile,
            ...(staticDirStats?.isDirectory() ? ['--rootStaticDir', staticDir] : [])
        ]);

        this.log('Tilda package built');
    }

    async catch(error: CommandError) {
        throw error;
    }
}
