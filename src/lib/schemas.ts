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
        featureFlags: z.array(z.enum(['nextjs-15-canary-ppr-v1'])).optional(),
        routes: z.array(z.object({
            criteria: z.object({
                path: z.object({
                    exact: z.string().optional(),
                    prefix: z.string().optional(),
                    oneOf: z.array(z.string()).min(1, 'At least one path is required in path.oneOf').max(100, 'Too many paths in path.oneOf').optional(),
                    regex: z.string().optional(),
                }),
                method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).or(z.array(z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])).max(7, 'Too many methods in path.method')).optional(),
            }),
            action: z.object({
                origin: z.enum(['compute', 'static']),
                originPath: z.string().optional(),
                status: z.number().optional(),
                headers: z.array(z.tuple([z.string(), z.string()])).optional(),
            }),
        })),
    }),
});

export const NextjsPrerenderManifestV4Schema = z.object({
    version: z.literal(4),
    routes: z.record(z.string(), z.object({
        renderingMode: z.enum(['STATIC', 'PARTIALLY_STATIC']).optional(),
        experimentalPPR: z.boolean().optional(),
        initialRevalidateSeconds: z.union([z.number(), z.boolean()]),
        srcRoute: z.string(),
        dataRoute: z.string().nullable().optional(),
    })),
    dynamicRoutes: z.record(z.string(), z.object({
        renderingMode: z.enum(['STATIC', 'PARTIALLY_STATIC']).optional(),
        experimentalPPR: z.boolean().optional(),
        fallbackSourceRoute: z.string(),
        routeRegex: z.string(),
    })),
});

export const NextjsRouteMetaSchema = z.object({
    status: z.number(),
    headers: z.record(z.string(), z.string()),
    postponed: z.string().optional(),
});

export const InlineRoutingConfigSchema = z.object({
    routes: z.array(z.object({
        criteria: z.object({
            path: z.object({
                exact: z.string().optional(),
                prefix: z.string().optional(),
                oneOf: z.array(z.string()).min(1, 'At least one path is required in path.oneOf').max(100, 'Too many paths in path.oneOf').optional(),
                regex: z.string().optional(),
            }),
            method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).or(z.array(z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])).max(7, 'Too many methods in path.method')).optional(),
        }),
        action: z.object({
            origin: z.enum(['compute', 'static']),
            staticFileRelativePath: z.string().optional(),
            status: z.number().optional(),
            headers: z.array(z.tuple([z.string(), z.string()])).optional(),
        }),
    })),
});
