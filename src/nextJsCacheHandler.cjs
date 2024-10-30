module.exports = class CacheHandler {
    constructor(options, ...rest) {
        this.options = options;

        const globalCacheHandlers = globalThis[Symbol.for('@next/cache-handlers')];
        if (globalCacheHandlers?.FetchCache) {
            this.globalCacheHandler = new globalCacheHandlers.FetchCache(options, ...rest);
        }
    }

    async get(...params) {
        return this.globalCacheHandler?.get(...params);
    }

    async set(...params) {
        return this.globalCacheHandler?.set(...params);
    }

    async revalidateTag(...params) {
        return this.globalCacheHandler?.revalidateTag(...params);
    }
}
