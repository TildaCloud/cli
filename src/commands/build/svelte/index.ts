import { Flags } from '@oclif/core'
import { type Stats } from "node:fs";
import * as path from 'node:path';
import * as cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import { CommandError } from "@oclif/core/interfaces";
import { safely } from "../../../lib/utils.js";
import { BaseCommand } from "../../../baseCommand.js";
import BuildCommand from '../index.js'

export default class BuildSvelte extends BaseCommand<typeof BuildSvelte> {
    static description = 'Build Svelte project'

    static flags = {
        projectDir: Flags.string({
            description: 'Relative path project directory',
            required: true,
            default: process.cwd()
        }),
        buildCommand: Flags.string({
            description: 'Svelte build command',
            required: true,
            default: 'npm run build'
        }),
    }

    async run(): Promise<void> {
        const { flags } = await this.parse(BuildSvelte)

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
            env: { GCP_BUILDPACKS: 'tilda', ...process.env }
        }));
        if (errorWithBuildCommand) {
            this.error(`Error running build command: ${errorWithBuildCommand.message}`);
        }

        this.log('Svelte build complete');

        this.log('Building Tilda package');

        const serverDir = path.resolve(projectDirPath, 'build');
        const serverEntryFile = path.resolve(serverDir, 'index.js');
        const staticDir = path.resolve(projectDirPath, 'build/client');
        const prerenderedDir = path.resolve(projectDirPath, 'build/prerendered');

        // Check if static dir exists
        const [errorWithStaticDirStats, staticDirStats] = await safely<Stats, {
            code?: string,
            message?: string
        }>(fs.stat(staticDir));
        if (errorWithStaticDirStats && errorWithStaticDirStats.code !== 'ENOENT') {
            this.error(`Error checking static dir: ${errorWithStaticDirStats.message}`);
        }

        // Check if prerendered dir exists
        const [errorWithPrerenderedDirStats, prerenderedDirStats] = await safely<Stats, {
            code?: string,
            message?: string
        }>(fs.stat(prerenderedDir));
        if (errorWithPrerenderedDirStats && errorWithPrerenderedDirStats.code !== 'ENOENT') {
            this.error(`Error checking prerendered dir: ${errorWithPrerenderedDirStats.message}`);
        }

        // Build command arguments for Tilda build
        const tildaBuildArgs = [
            '--projectDir', projectDirPath,
            '--serverDir', serverDir,
            '--serverEntryFile', serverEntryFile,
        ];

        // Add static directories if they exist
        if (staticDirStats?.isDirectory()) {
            tildaBuildArgs.push('--rootStaticDir', staticDir);
        }
        if (prerenderedDirStats?.isDirectory()) {
            tildaBuildArgs.push('--rootStaticDir', prerenderedDir);
        }

        await BuildCommand.run(tildaBuildArgs);

        this.log('Tilda package built');
    }
}
