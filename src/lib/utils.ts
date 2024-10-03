export async function safely<T, E = Error>(fnOrPromise: Promise<T> | (() => T)): Promise<[E, undefined] | [undefined, T]> {
    try {
        let result: T;
        if (typeof fnOrPromise === 'function') {
            result = fnOrPromise();
        } else {
            result = await fnOrPromise;
        }
        return [undefined, result];
    } catch (error) {
        return [error as E, undefined];
    }
}

