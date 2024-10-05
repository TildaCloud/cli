import * as crypto from 'node:crypto'
import {type CreateTRPCClient, createTRPCClient, httpBatchLink} from "@trpc/client";
// @ts-ignore: TS6059
// eslint-disable-next-line import/no-unresolved
import {AppRouter} from "@site/src/routes/api/[any]/router.js";

let trpcClient: CreateTRPCClient<AppRouter>;

export const getTrpcClient = (origin: string, privateKey: crypto.KeyObject, keyId: number): typeof trpcClient => {
    if (trpcClient) {
        return trpcClient;
    }

    trpcClient = createTRPCClient<AppRouter>({
        links: [
            httpBatchLink({
                url: new URL('/api/', origin).toString(),
                async fetch(...params) {
                    const request = new Request(...params);
                    const requestBody = Buffer.from(await request.arrayBuffer());

                    // hash SHA256 of request body
                    const bodyHash = crypto.createHash('SHA256')
                        .update(requestBody)
                        .digest();

                    request.headers.set('content-digest', encodeHeaderValueParams({
                        'sha-256': new ParamBuffer(bodyHash)
                    }));

                    const signatureInputComponents = ['@method', '@target-uri', 'content-digest', 'content-length', 'content-type'];
                    const sig1Value = '(' + signatureInputComponents.map(component => JSON.stringify(component)).join(' ') + ')';

                    const signatureCreatedAt = Math.ceil(Date.now() / 1000);
                    const signatureInputSting = encodeHeaderValueParams({
                        sig1: new ParamBareString(sig1Value),
                        created: signatureCreatedAt,
                        keyid: keyId.toString(),
                    });
                    request.headers.set('signature-input', signatureInputSting);

                    const signatureBaseParams = {
                        '@method': request.method,
                        '@target-uri': request.url,
                        'content-digest': request.headers.get('content-digest'),
                        'content-length': requestBody.byteLength,
                        'content-type': request.headers.get('content-type'),
                        '@signature-params': request.headers.get('signature-input')?.slice('sig1'.length + 1),
                    }
                    const signatureBase = Object.entries(signatureBaseParams)
                        .map(([key, value]) => [JSON.stringify(key), value].join(': '))
                        .join('\n');

                    // sign signatureBase with privateKey
                    const signature = crypto.createSign('SHA256')
                        .update(signatureBase)
                        .end();

                    // get base64 encoded signature
                    const signatureBase64 = signature.sign(privateKey);

                    request.headers.set('signature', encodeHeaderValueParams({
                        sig1: new ParamBuffer(signatureBase64),
                    }));

                    return fetch(request);
                }
            }),
        ],
    });

    return trpcClient;
}

class ParamBareString {
    constructor(public value: string) {
    }

    toString() {
        return this.value;
    }
}

class ParamBuffer {
    constructor(public value: Buffer) {
    }

    toString() {
        return ':' + this.value.toString('base64') + ':';
    }
}

function encodeHeaderValueParams(params: Record<string, string | number | ParamBareString | ParamBuffer>) {
    return Object.entries(params)
        .map(([key, value]) => {
            if (value instanceof ParamBareString) {
                return [key, value.toString()].join('=');
            }
            if (value instanceof ParamBuffer) {
                return [key, value.toString()].join('=');
            }

            return [key, JSON.stringify(value)].join('=');
        })
        .join(';')
}
