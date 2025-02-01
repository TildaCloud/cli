import { Flags } from '@oclif/core'
import { type Stats } from "node:fs";
import * as path from 'node:path';
import * as cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import { CommandError } from "@oclif/core/interfaces";
import { safely } from "../../../lib/utils.js";
import { BaseCommand } from "../../../baseCommand.js";
import BuildCommand from '../index.js'

export default class BuildQwik extends BaseCommand<typeof BuildQwik> {
    static description = 'Build Qwik City project'

    static flags = {
        projectDir: Flags.string({
            description: 'Relative path project directory',
            required: true,
            default: process.cwd()
        }),
        buildCommand: Flags.string({
            description: 'Qwik City build command',
            required: true,
            default: 'npm run build'
        }),
    }

    async run(): Promise<void> {
        const { flags } = await this.parse(BuildQwik)

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

        this.log('Qwik build complete');

        this.log('Building Tilda package');

        const serverDir = path.resolve(projectDirPath, 'server');
        const staticDir = path.resolve(projectDirPath, 'dist');
        
        // Check for available server entry file
        const fastifyEntryPath = path.resolve(serverDir, 'entry.fastify.js');
        const expressEntryPath = path.resolve(serverDir, 'entry.express.js');
        
        const [errorWithFastifyStats, fastifyStats] = await safely<Stats>(fs.stat(fastifyEntryPath));
        const [errorWithExpressStats, expressStats] = await safely<Stats>(fs.stat(expressEntryPath));
        
        let serverEntryFile: string;
        if (fastifyStats?.isFile()) {
            serverEntryFile = fastifyEntryPath;
        } else if (expressStats?.isFile()) {
            serverEntryFile = expressEntryPath;
        } else {
            this.error('No server entry file found. Expected either entry.fastify.js or entry.express.js in the server directory. Please ensure you\'re using Node.js adapter for Qwik City.');
        }

        // Check if static dir exists
        const [errorWithStaticDirStats, staticDirStats] = await safely<Stats, {
            code?: string,
            message?: string
        }>(fs.stat(staticDir));
        if (errorWithStaticDirStats && errorWithStaticDirStats.code !== 'ENOENT') {
            this.error(`Error checking static dir: ${errorWithStaticDirStats.message}`);
        }

        // Build command arguments for Tilda build
        const tildaBuildArgs = [
            '--projectDir', projectDirPath,
            '--serverDir', serverDir,
            '--serverEntryFile', serverEntryFile,
        ];

        // Add static directory if it exists
        if (staticDirStats?.isDirectory()) {
            tildaBuildArgs.push('--rootStaticDir', staticDir);
        }

        await BuildCommand.run(tildaBuildArgs);

        this.log('Tilda package built');
    }
}
