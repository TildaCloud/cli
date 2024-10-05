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
import {BaseCommand} from "../../baseCommand.js";

const EnvXdgConfigHome = process.env.XDG_CONFIG_HOME!;
const EnvHome = process.env.HOME!;

export default class Logout extends BaseCommand<typeof Logout> {
    static description = 'Log in to Tilda'

    static flags = {
        force: Flags.boolean({description: 'Force logout', default: false}),
    }

    async run(): Promise<void> {
        const {args, flags, argv} = await this.parse(Logout)

        if (!this.tildaConfig.v1.identity) {
            this.log('You are not logged in');
            return;
        }

        this.debug(format("Logging out", this.tildaConfig.v1.identity.userName));

        if (!this.apiClient) {
            this.error({
                name: 'API_CLIENT_NOT_INITIALIZED',
                message: 'API client not initialized'
            })
        }

        const [errorWithRevokingKey, response] = await safely(this.apiClient.deletePublicKey.mutate({
            publicKeyId: this.tildaConfig.v1.identity.keyId,
        }));
        if (errorWithRevokingKey && !flags.force) {
            this.error(format('Error revoking key:', errorWithRevokingKey.message, '. Use --force to ignore this error.'));
        }

        this.debug('Revoked key', response);

        const privateKeyPath = path.resolve(this.config.configDir, this.tildaConfig.v1.identity.userId + '.pem');

        // remove private key file
        const [errorWithRemovingPrivateKey] = await safely(fs.rm(privateKeyPath));
        if (errorWithRemovingPrivateKey) {
            this.warn(`Error removing private key file: ${errorWithRemovingPrivateKey.message}`);
        }

        const userName = this.tildaConfig.v1.identity.userName;

        // remove identity from config
        const {v1: {identity, ...config}} = this.tildaConfig;
        await this.updateTildaConfig({v1: config});

        this.log(format('Logged out', userName));
    }
}
