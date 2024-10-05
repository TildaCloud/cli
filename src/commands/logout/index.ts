import {Args, Command, Flags} from '@oclif/core'
import * as path from 'node:path';
import {format} from 'node:util'
import {z} from 'zod';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import {nodeFileTrace} from '@vercel/nft';
import {safely} from "../../lib/utils.js";
import {getTrpcClient} from "../../lib/api.js";
import {createTRPCClient, httpBatchLink} from "@trpc/client";
// @ts-ignore: TS6059

import {AppRouter} from "@site/src/routes/api/[any]/router.js";
import {CliConfigSchema} from "../../lib/schemas.js";

const EnvXdgConfigHome = process.env.XDG_CONFIG_HOME!;
const EnvHome = process.env.HOME!;

export default class Logout extends Command {
    static description = 'Log in to Tilda'

    static flags = {
        apiOrigin: Flags.string({description: 'API origin', required: true, env: 'TILDA_CLI_API_ORIGIN'}),
        force: Flags.boolean({description: 'Force logout', default: false}),
    }

    async run(): Promise<void> {
        const {args, flags, argv} = await this.parse(Logout)

        const defaultSystemConfigDirPath = path.join(EnvHome, '.config');
        const systemConfigDirPath = EnvXdgConfigHome || defaultSystemConfigDirPath;
        const tildaConfigDirPath = path.resolve(systemConfigDirPath, 'tilda');

        const tildaConfigFilePath = path.resolve(tildaConfigDirPath, 'config.json');

        // Load config
        const [errorWithStatOfConfig, configStats] = await safely<Awaited<ReturnType<typeof fs.stat>>, {
            code: 'ENOENT',
            message: string
        }>(fs.stat(tildaConfigFilePath));
        if (errorWithStatOfConfig) {
            if (errorWithStatOfConfig.code !== 'ENOENT') {
                this.error(`Error checking config file: ${errorWithStatOfConfig.message}`);
            }

            // create config directory
            const [errorWithCreatingConfigDir] = await safely(fs.mkdir(tildaConfigDirPath, {
                recursive: true,
            }));
            if (errorWithCreatingConfigDir) {
                this.error(`Error creating config directory: ${errorWithCreatingConfigDir.message}`);
            }

            // create config file
            const defaultConfig: z.infer<typeof CliConfigSchema> = {
                v1: {}
            }
            const [errorWithCreatingConfigFile] = await safely(fs.writeFile(tildaConfigFilePath, JSON.stringify(defaultConfig, null, 2)));
            if (errorWithCreatingConfigFile) {
                this.error(`Error creating config file: ${errorWithCreatingConfigFile.message}`);
            }
        }
        if (configStats && !configStats.isFile()) {
            this.error(`Config is not a valid file: ${tildaConfigFilePath}`);
        }

        const [errorWithReadingConfig, configFileContents] = await safely(fs.readFile(tildaConfigFilePath, 'utf8'));
        if (errorWithReadingConfig) {
            this.error(`Error reading config file: ${errorWithReadingConfig.message}`);
        }

        const [errorWithJsonParsingConfig, configFileJson] = await safely(() => JSON.parse(configFileContents));
        if (errorWithJsonParsingConfig) {
            this.error(`Error parsing config file: ${errorWithJsonParsingConfig.message}`);
        }

        const [errorWithGettingConfig, config] = await safely(CliConfigSchema.parseAsync(configFileJson));
        if (errorWithGettingConfig) {
            this.error(`Error getting config: ${errorWithGettingConfig.message}`);
        }

        if (config.v1.identity) {
            // check if private key exists for this user
            const privateKeyPath = path.resolve(tildaConfigDirPath, config.v1.identity.userId + '.pem');
            const [errorWithStatOfPrivateKey, privateKeyStats] = await safely<Awaited<ReturnType<typeof fs.stat>>, {
                code: 'ENOENT',
                message: string
            }>(fs.stat(privateKeyPath));
            if (errorWithStatOfPrivateKey) {
                if (errorWithStatOfPrivateKey.code !== 'ENOENT') {
                    this.error(`Error checking private key file: ${errorWithStatOfPrivateKey.message}`);
                }
            } else if (!privateKeyStats.isFile()) {
                this.warn(`Private key is not a valid file: ${privateKeyPath}`);

                // remove private key file
                const [errorWithRemovingPrivateKey] = await safely(fs.rm(privateKeyPath));
                if (errorWithRemovingPrivateKey) {
                    this.warn(`Error removing private key file: ${errorWithRemovingPrivateKey.message}`);
                }

                // remove identity from config
                delete config.v1.identity;
                const [errorWithWritingConfig, configWriteResult] = await safely(fs.writeFile(tildaConfigFilePath, JSON.stringify(config, null, 2)));
                if (errorWithWritingConfig) {
                    this.error(`Error writing config: ${errorWithWritingConfig.message}`);
                }
            }
        }

        if (!config.v1.identity) {
            this.log('You are not logged in');
            return;
        }

        this.debug(format("Logging out", config.v1.identity.userName));

        // read the private key
        const privateKeyPath = path.resolve(tildaConfigDirPath, config.v1.identity.userId + '.pem');

        const [errorWithReadingPrivateKey, privateKeyPemContents] = await safely(fs.readFile(privateKeyPath, 'utf8'));
        if (errorWithReadingPrivateKey) {
            this.warn(`Error reading private key: ${errorWithReadingPrivateKey.message}`);

            // remove private key file
            const [errorWithRemovingPrivateKey] = await safely(fs.rm(privateKeyPath));
            if (errorWithRemovingPrivateKey) {
                this.warn(`Error removing private key file: ${errorWithRemovingPrivateKey.message}`);
            }

            // remove identity from config
            delete config.v1.identity;
            const [errorWithWritingConfig, configWriteResult] = await safely(fs.writeFile(tildaConfigFilePath, JSON.stringify(config, null, 2)));
            if (errorWithWritingConfig) {
                this.error(`Error writing config: ${errorWithWritingConfig.message}`);
            }

            return;
        }

        const [errorParsingPrivateKey, privateKey] = await safely(() => crypto.createPrivateKey({
            key: privateKeyPemContents,
            format: 'pem'
        }));
        if (errorParsingPrivateKey) {
            this.warn(`Error parsing private key: ${errorParsingPrivateKey.message}`);

            // remove private key file
            const [errorWithRemovingPrivateKey] = await safely(fs.rm(privateKeyPath));
            if (errorWithRemovingPrivateKey) {
                this.warn(`Error removing private key file: ${errorWithRemovingPrivateKey.message}`);
            }

            // remove identity from config
            delete config.v1.identity;
            const [errorWithWritingConfig, configWriteResult] = await safely(fs.writeFile(tildaConfigFilePath, JSON.stringify(config, null, 2)));
            if (errorWithWritingConfig) {
                this.error(`Error writing config: ${errorWithWritingConfig.message}`);
            }

            return;
        }

        // revoke the key
        const trpcClient = getTrpcClient(flags.apiOrigin, privateKey, config.v1.identity.keyId);

        const [errorWithRevokingKey, response] = await safely(trpcClient.deletePublicKey.mutate({
            publicKeyId: config.v1.identity.keyId,
        }));
        if (errorWithRevokingKey && !flags.force) {
            this.error(format('Error revoking key:', errorWithRevokingKey.message, '. Use --force to ignore this error.'));
        }

        this.debug('Revoked key', response);

        // remove private key file
        const [errorWithRemovingPrivateKey] = await safely(fs.rm(privateKeyPath));
        if (errorWithRemovingPrivateKey) {
            this.warn(`Error removing private key file: ${errorWithRemovingPrivateKey.message}`);
        }

        const userName = config.v1.identity.userName;

        // remove identity from config
        delete config.v1.identity;
        const [errorWithWritingConfig, configWriteResult] = await safely(fs.writeFile(tildaConfigFilePath, JSON.stringify(config, null, 2)));
        if (errorWithWritingConfig) {
            this.error(`Error writing config: ${errorWithWritingConfig.message}`);
        }

        this.log(format('Logged out', userName));
    }
}
