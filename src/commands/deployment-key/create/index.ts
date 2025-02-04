import { Flags } from '@oclif/core'
import { Blob } from 'node:buffer'
import { FormData, fetch } from 'undici'
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import { format } from "node:util";
import { safely } from "../../../lib/utils.js";
import { BaseCommand } from "../../../baseCommand.js";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
// @ts-ignore: TS6059
// eslint-disable-next-line import/no-unresolved
import { AppRouter } from "@site/src/routes/api/[any]/router.js";

export default class GenerateDeploymentCreate extends BaseCommand<typeof GenerateDeploymentCreate> {
    static description = 'Create a deployment key'

    static flags = {
        project: Flags.string({
            description: 'Project slug',
            required: true,
        }),
        site: Flags.string({
            description: 'Site slug',
            required: false,
        }),
    }

    async run(): Promise<void> {
        const { args, flags, argv } = await this.parse(GenerateDeploymentCreate);

        this.log('Generating key pair for deployment...');

        // create private public key pair
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
        const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

        this.log('Requesting registration of newly generated deployment key');
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
                hashingAlgorithm: 'SHA256',
                projectSlug: flags.project,
                serviceSlug: flags.site,
            }));
        if (errorWithRequestingRegistration) {
            this.error(`Error requesting registration: ${errorWithRequestingRegistration.message}`);
        }

        this.log('Please visit the following URL to complete logging in. Make sure that the public key on the web page matches the one above.');
        this.log(registrationRequestReply.authorizationUrl);

        let publicKeyId: number | undefined = undefined;
        do {
            const [errorWithPublicKeyRequest, receivedPublicKeyId] = await safely(unauthenticatedApiClient.getPublicKeyId.query({
                publicKey: publicKeyPem,
            }));
            if (errorWithPublicKeyRequest || !receivedPublicKeyId) {
                if (errorWithPublicKeyRequest) {
                    this.log(`Error requesting public key: ${errorWithPublicKeyRequest.message}`);
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
            publicKeyId = receivedPublicKeyId;
            break;
        } while (true)
        if (!publicKeyId) {
            this.error('Error getting public key');
        }

        const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
        this.log('Deployment key created successfully!');
        this.log('');
        this.log('Use the following environment variable to use this key for deployment. This is a sensitive value and should be kept private.');
        this.log('');
        const encodedJsonIdentity = JSON.stringify({
            privateKey: privateKeyPem,
            keyId: publicKeyId,
        });
        this.log("For contexts where you need to escape quotes, e.g. JavaScript, shell, etc., use:")
        this.log(`TILDA_CLI_INLINE_IDENTITY_JSON=${JSON.stringify(encodedJsonIdentity)}`);
        this.log('');
        this.log('For context where you don\'t need to escape quotes, e.g. Github Sections and Variables settings, Tilda Environment Variables:');
        this.log(`Key: TILDA_CLI_INLINE_IDENTITY_JSON`);
        this.log(`Value: ${encodedJsonIdentity}`);
    }
}
