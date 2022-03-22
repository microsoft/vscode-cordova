// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

export class DeferredPromise<T> {
    private resolveSelf: (value: T | PromiseLike<T>) => void;
    private rejectSelf: (reason?: any) => void;
    private _promise: Promise<T>;

    constructor() {
        this._promise = new Promise<T>((resolve, reject) => {
            this.resolveSelf = resolve;
            this.rejectSelf = reject;
        });
    }

    public resolve(val: T): void {
        this.resolveSelf(val);
    }

    public reject(reason: any): void {
        this.rejectSelf(reason);
    }

    public get promise(): Promise<T> {
        return this._promise;
    }
}

export function waitUntil<T>(
    condition: () => Promise<T | null> | T | null,
    interval: number = 1000,
    timeout?: number,
): Promise<T | null> {
    return new Promise(async (resolve, reject) => {
        let rejectTimeout: NodeJS.Timeout | undefined;
        // eslint-disable-next-line prefer-const
        let сheckInterval: NodeJS.Timeout | undefined;

        if (timeout) {
            rejectTimeout = setTimeout(() => {
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                cleanup();
                resolve(null);
            }, timeout);
        }

        const cleanup = () => {
            if (rejectTimeout) {
                clearTimeout(rejectTimeout);
            }
            if (сheckInterval) {
                clearInterval(сheckInterval);
            }
        };

        const tryToResolve = async (): Promise<boolean> => {
            try {
                const result = await condition();
                if (result) {
                    cleanup();
                    resolve(result);
                }
                return !!result;
            } catch (err) {
                cleanup();
                reject(err);
                return false;
            }
        };

        const resolved = await tryToResolve();
        if (resolved) {
            return;
        }

        сheckInterval = setInterval(async () => {
            await tryToResolve();
        }, interval);
    });
}
