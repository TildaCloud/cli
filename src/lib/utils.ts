export async function safely<T, E = Error>(fnOrPromise: (() => T) | Promise<T>): Promise<[E, undefined] | [undefined, T]> {
    try {
        const result: T = typeof fnOrPromise === 'function' ? fnOrPromise() : (await fnOrPromise);
        return [undefined, result];
    } catch (error) {
        return [error as E, undefined];
    }
}

