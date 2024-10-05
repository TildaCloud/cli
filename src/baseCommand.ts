import {Command, Flags, Interfaces} from '@oclif/core'
import path from "node:path";
import {safely} from "./lib/utils.js";
import fs from "node:fs/promises";
import {z} from "zod";
import {CliConfigSchema} from "./lib/schemas.js";

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
    }

    protected flags!: Flags<T>
    protected args!: Args<T>
    protected tildaConfig!: z.infer<typeof CliConfigSchema>

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
                v1: {}
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

        this.tildaConfig = config
    }

    public async updateTildaConfig(config: z.infer<typeof CliConfigSchema>): Promise<z.infer<typeof CliConfigSchema>> {
        const tildaConfigFilePath = path.resolve(this.config.configDir, 'config.json');
        const [errorWithWritingConfig, configWriteResult] = await safely(fs.writeFile(tildaConfigFilePath, JSON.stringify(config, null, 2)));
        if (errorWithWritingConfig) {
            this.error(`Error writing config: ${errorWithWritingConfig.message}`);
        }

        this.tildaConfig = config
        return config
    }
}
