import {Flags} from '@oclif/core'
import * as path from 'node:path';
import {format} from 'node:util'
import * as fs from 'node:fs/promises';
import {safely} from "../../lib/utils.js";
import {BaseCommand} from "../../baseCommand.js";

export default class Logout extends BaseCommand<typeof Logout> {
    static description = 'Log in to Tilda'

    static flags = {
        force: Flags.boolean({description: 'Force logout', default: false}),
    }

    async run(): Promise<void> {
        const {args, flags, argv} = await this.parse(Logout)

        if (!this.identity) {
            this.log('You are not logged in');
            return;
        }

        this.debug(format("Logging out", this.identity.userName));

        if (!this.apiClient) {
            this.error('API client not initialized', {
                code: 'API_CLIENT_NOT_INITIALIZED',
            })
        }

        const [errorWithRevokingKey, response] = await safely(this.apiClient.publicKey.deletePublicKey.mutate({
            publicKeyId: this.identity.keyId,
        }));
        if (errorWithRevokingKey && !flags.force) {
            this.error(format('Error revoking key:', errorWithRevokingKey.message), {
                code: 'ERROR_REVOKING_KEY',
                suggestions: ['Use --force to ignore this error.']
            });
        }

        this.debug('Revoked key', response);

        const privateKeyPath = path.resolve(this.config.configDir, [encodeURIComponent(flags.apiOrigin), this.identity.userId, 'pem'].join('.'));

        // remove private key file
        const [errorWithRemovingPrivateKey] = await safely(fs.rm(privateKeyPath));
        if (errorWithRemovingPrivateKey) {
            this.warn(`Error removing private key file: ${errorWithRemovingPrivateKey.message}`);
        }

        const userName = this.identity.userName;

        // remove identity from config
        const newConfig = structuredClone(this.tildaConfig);
        delete newConfig.v1.identities[this.flags.apiOrigin];
        await this.updateTildaConfig(newConfig);

        this.log(format('Logged out', userName));
    }
}
