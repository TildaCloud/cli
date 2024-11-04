import {z} from 'zod';

export const CliConfigSchema = z.object({
    v1: z.object({
        identities: z.record(
            z.string(), z.object({
                keyId: z.number(),
                userId: z.number(),
                userName: z.string(),
            }).optional()
        ),
    })
})

export const PackageLockJsonSchema = z.object({
    name: z.string(),
    lockfileVersion: z.number(),
    requires: z.boolean(),
    packages: z.record(z.string(), z.object({
        version: z.string().optional(),
    })),
});

export const InlineIdentityJsonSchema = z.object({
    privateKey: z.string(),
    keyId: z.number(),
});
