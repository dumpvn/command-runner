'use strict';


/* 

start https://stackoverflow.com/questions/51936369/what-is-the-record-type-in-typescript

*/
export default function cache<T extends object>(target: T): T {

    const cached: Record<string, unknown> = Object.create(null);
    const proxy: T = Object.create(target);

    Object.keys(target).forEach(key => {
        const handler = target[key as keyof T];
        if (typeof handler === 'function') {

            Object.defineProperty(proxy, key, {
                value: (...args: unknown[]) => {
                    if (key in cached) {
                        return cached[key];
                    }
                    return cached[key] = handler.apply(proxy, args);
                },
            });
        }
    });

    return proxy;
}
