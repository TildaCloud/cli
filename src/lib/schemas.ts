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
