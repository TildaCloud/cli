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
// eslint-disable-next-line import/no-unresolved
import {AppRouter} from "@site/src/routes/api/[any]/router.js";
import {CliConfigSchema} from "../../lib/schemas.js";
import {BaseCommand} from "../../baseCommand.js";

const EnvXdgConfigHome = process.env.XDG_CONFIG_HOME!;
const EnvHome = process.env.HOME!;

export default class Login extends BaseCommand<typeof Login> {
    static description = 'Log in to Tilda'

    static flags = {}

    async run(): Promise<void> {
        const {args, flags, argv} = await this.parse(Login)

        if (this.identity) {
            // check if private key exists for this user
            const privateKeyPath = path.resolve(this.config.configDir, [encodeURIComponent(flags.apiOrigin), this.identity.userId, 'pem'].join('.'));
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
                const newConfig = structuredClone(this.tildaConfig);
                delete newConfig.v1.identities[flags.apiOrigin];
                await this.updateTildaConfig(newConfig);
            }
        }

        if (this.identity) {
            this.log(format("You're logged in as", this.identity.userName, '. Run `tilda logout` to log out.'));
            return;
        }

        this.log('Generating key pair for signing...');

        // create private public key pair
        const {publicKey, privateKey} = crypto.generateKeyPairSync('ec', {namedCurve: 'secp256k1'});
        const publicKeyPem = publicKey.export({type: 'spki', format: 'pem'}).toString();

        this.log('Requesting registration of newly generated public key');
        this.log(publicKeyPem);

        const unauthenticatedApiClient = createTRPCClient<AppRouter>({
            links: [
                httpBatchLink({
                    url: new URL('/api/', flags.apiOrigin).toString(),
                }),
            ],
        });

        const [errorWithRequestingRegistration, registrationRequestReply] = await safely(
            unauthenticatedApiClient.requestRegistrationOfPublicKey.mutate({
                publicKey: publicKeyPem,
                hashingAlgorithm: 'SHA256'
            }));
        if (errorWithRequestingRegistration) {
            this.error(`Error requesting registration: ${errorWithRequestingRegistration.message}`);
        }

        this.log('Please visit the following URL to complete logging in. Make sure that the public key on the web page matches the one above.');
        this.log(registrationRequestReply.authorizationUrl);

        let publicKeyId: number | undefined = undefined;
        do {
            const [errorWithMeRequest, receivedPublicKeyId] = await safely(unauthenticatedApiClient.getPublicKeyId.query({
                publicKey: publicKeyPem,
            }));
            if (errorWithMeRequest || !receivedPublicKeyId) {
                if (errorWithMeRequest) {
                    this.log(`Error requesting me: ${errorWithMeRequest.message}`);
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
            this.log(receivedPublicKeyId);
            publicKeyId = receivedPublicKeyId;
            break;
        } while (true)

        if (!publicKeyId) {
            this.error('Error getting public key');
        }

        const apiClient = getTrpcClient(flags.apiOrigin, privateKey, publicKeyId!);

        const [errorWithMe, me] = await safely(apiClient.me.query());
        if (errorWithMe) {
            this.error(`Error getting user info: ${errorWithMe.message}`);
        }
        if (!me) {
            this.error('Error getting user info');
        }

        const privateKeyPem = privateKey.export({type: 'pkcs8', format: 'pem'}).toString();
        const privateKeyPath = path.resolve(this.config.configDir, [encodeURIComponent(flags.apiOrigin), me.id, 'pem'].join('.'));

        const [errorWithWritingPrivateKey, privateKeyWriteResult] = await safely(fs.writeFile(privateKeyPath, privateKeyPem, {
            mode: 0o600,
        }));
        if (errorWithWritingPrivateKey) {
            this.error(`Error writing private key: ${errorWithWritingPrivateKey.message}`);
        }

        this.debug(`Private key written to: ${privateKeyPath}`);

        const newConfig = structuredClone(this.tildaConfig);
        newConfig.v1.identities[flags.apiOrigin] = {
            keyId: publicKeyId,
            userId: me.id,
            userName: me.name,
        }

        await this.updateTildaConfig(newConfig);

        this.log(format("You're logged in as", me.name));
    }
}
