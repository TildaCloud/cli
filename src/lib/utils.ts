export async function safely<T, E = Error>(fnOrPromise: (() => T) | Promise<T>): Promise<[E, undefined] | [undefined, Awaited<T>]> {
    try {
        const result: T = typeof fnOrPromise === 'function' ? fnOrPromise() : (await fnOrPromise);
        return [undefined, await result];
    } catch (error) {
        return [error as E, undefined];
    }
}

