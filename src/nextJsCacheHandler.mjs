export default class CacheHandler {
    constructor(options) {
        this.options = options;

        const globalCacheHandlers = globalThis[Symbol.for('@next/cache-handlers')];
        if (globalCacheHandlers?.FetchCache) {
            // eslint-disable-next-line prefer-rest-params
            this.globalCacheHandler = new globalCacheHandlers.FetchCache(arguments);
        }
    }

    async get() {
        // eslint-disable-next-line prefer-rest-params
        return this.globalCacheHandler?.get(arguments);
    }

    async set() {
        // eslint-disable-next-line prefer-rest-params
        return this.globalCacheHandler?.set(arguments);
    }

    async revalidateTag() {
        // eslint-disable-next-line prefer-rest-params
        return this.globalCacheHandler?.revalidateTag(arguments);
    }
}
