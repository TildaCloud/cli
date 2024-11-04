import {Command, Flags, Interfaces} from '@oclif/core'
import * as crypto from "node:crypto";
import path from "node:path";
import {safely} from "./lib/utils.js";
import fs from "node:fs/promises";
import {z} from "zod";
import {CliConfigSchema, InlineIdentityJsonSchema} from "./lib/schemas.js";
import {createTRPCClient} from "@trpc/client";
// @ts-ignore: TS6059
// eslint-disable-next-line import/no-unresolved
import {AppRouter} from "@site/src/routes/api/[any]/router.js";
import {getTrpcClient} from "./lib/api.js";

export type Flags<T extends typeof Command> = Interfaces.InferredFlags<typeof BaseCommand['baseFlags'] & T['flags']>
export type Args<T extends typeof Command> = Interfaces.InferredArgs<T['args']>

export abstract class BaseCommand<T extends typeof Command> extends Command {
    // add the --json flag
    static enableJsonFlag = true

    // define flags that can be inherited by any command that extends BaseCommand
    static baseFlags = {
        apiOrigin: Flags.string({
            description: 'API origin',
            required: true,
            env: 'TILDA_CLI_API_ORIGIN',
            default: 'https://tilda.net'
        }),
        inlineIdentityJson: Flags.string({
            description: 'Private key config. Must be of type { privateKey: string, keyId: number }',
            required: false,
            env: 'TILDA_CLI_INLINE_IDENTITY_JSON'
        }),
    }

    protected flags!: Flags<T>
    protected args!: Args<T>
    protected tildaConfig!: z.infer<typeof CliConfigSchema>
    protected apiClient?: ReturnType<typeof createTRPCClient<AppRouter>>
    protected identity?: z.infer<typeof CliConfigSchema>['v1']['identities'][string]

    public async init(): Promise<void> {
        await super.init()
        const {args, flags} = await this.parse({
            flags: this.ctor.flags,
            baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
            enableJsonFlag: this.ctor.enableJsonFlag,
            args: this.ctor.args,
            strict: this.ctor.strict,
        })
        this.flags = flags as Flags<T>
        this.args = args as Args<T>

        const tildaConfigFilePath = path.resolve(this.config.configDir, 'config.json');

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
            const [errorWithCreatingConfigDir] = await safely(fs.mkdir(this.config.configDir, {
                recursive: true,
            }));
            if (errorWithCreatingConfigDir) {
                this.error(`Error creating config directory: ${errorWithCreatingConfigDir.message}`);
            }

            // create config file
            const defaultConfig: z.infer<typeof CliConfigSchema> = {
                v1: {identities: {}}
            }
            await this.updateTildaConfig(defaultConfig)
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

        this.tildaConfig = Object.freeze(config);

        const identity = this.tildaConfig.v1.identities[this.flags.apiOrigin];
        this.identity = Object.freeze(identity);

        const [errorWithParsingInlineIdentity, inlineIdentityJson] = await safely(() => JSON.parse(this.flags.inlineIdentityJson!));
        if (this.flags.inlineIdentityJson && errorWithParsingInlineIdentity) {
            this.error(`Error parsing inline identity: ${errorWithParsingInlineIdentity.message}`);
        }

        const [errorWithInlineIdentityJson, inlineIdentity] = await safely(InlineIdentityJsonSchema.parseAsync(inlineIdentityJson));
        if (this.flags.inlineIdentityJson && errorWithInlineIdentityJson) {
            this.error(`Error getting validating inline identity: ${errorWithInlineIdentityJson.message}`);
        }

        if (identity) {
            // read the private key
            const privateKeyPath = path.resolve(this.config.configDir, [encodeURIComponent(flags.apiOrigin), identity.userId, 'pem'].join('.'));

            const [errorWithReadingPrivateKey, privateKeyPemContents] = await safely(fs.readFile(privateKeyPath, 'utf8'));
            if (errorWithReadingPrivateKey) {
                this.warn(`Error reading private key: ${errorWithReadingPrivateKey.message}`);

                // remove private key file
                const [errorWithRemovingPrivateKey] = await safely(fs.rm(privateKeyPath));
                if (errorWithRemovingPrivateKey) {
                    this.warn(`Error removing private key file: ${errorWithRemovingPrivateKey.message}`);
                }

                // remove identity from config
                const newConfig = structuredClone(this.tildaConfig);
                delete newConfig.v1.identities[this.flags.apiOrigin];
                await this.updateTildaConfig(newConfig);
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
                const newConfig = structuredClone(this.tildaConfig);
                delete newConfig.v1.identities[this.flags.apiOrigin];
                await this.updateTildaConfig(newConfig);
                return;
            }

            const trpcClient = getTrpcClient(flags.apiOrigin, privateKey, identity.keyId);
            this.apiClient = trpcClient
        } else if (inlineIdentity) {
            const [errorWithCreatingPrivateKey, privateKey] = await safely(() => crypto.createPrivateKey({
                key: inlineIdentity.privateKey,
                format: 'pem'
            }));
            if (errorWithCreatingPrivateKey) {
                this.error(`Error creating private key: ${errorWithCreatingPrivateKey.message}`);
            }

            const trpcClient = getTrpcClient(flags.apiOrigin, privateKey, inlineIdentity.keyId);
            this.apiClient = trpcClient;
        }
    }

    public async updateTildaConfig(config: z.infer<typeof CliConfigSchema>): Promise<z.infer<typeof CliConfigSchema>> {
        const tildaConfigFilePath = path.resolve(this.config.configDir, 'config.json');
        const [errorWithWritingConfig, configWriteResult] = await safely(fs.writeFile(tildaConfigFilePath, JSON.stringify(config, null, 2)));
        if (errorWithWritingConfig) {
            this.error(`Error writing config: ${errorWithWritingConfig.message}`);
        }

        this.tildaConfig = config

        // update identity
        const identity = config.v1.identities[this.flags.apiOrigin];
        this.identity = Object.freeze(identity);

        return config
    }
}
