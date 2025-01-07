import { z } from 'zod';

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

export const TildaDeploymentMetadataSchema = z.object({
    v2: z.object({
        serverEntryFilePathRelativeToComputeDir: z.string().optional(),
        nodeJsVersion: z.string(),
        tildaCliVersion: z.string().optional(),
        framework: z.string().optional(),
        frameworkVersion: z.string().optional(),
        routes: z.array(z.object({
            criteria: z.object({
                path: z.object({
                    exact: z.string().optional(),
                    prefix: z.string().optional(),
                    oneOf: z.array(z.string()).min(1, 'At least one path is required in path.oneOf').max(100, 'Too many paths in path.oneOf').optional(),
                })
            }),
            action: z.object({
                origin: z.enum(['compute', 'static']),
                originPath: z.string().optional(),
            }),
        })),
    }),
});
