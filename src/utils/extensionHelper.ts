// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import Q = require("q");

export function generateRandomPortNumber() {
    return Math.round(Math.random() * 40000 + 3000);
}

export function retryAsync<T>(func: () => Q.Promise<T>, condition: (result: T) => boolean, maxRetries: number, iteration: number, delay: number, failure: string): Q.Promise<T> {
    const retry = () => {
        if (iteration < maxRetries) {
            return Q.delay(delay).then(() => retryAsync(func, condition, maxRetries, iteration + 1, delay, failure));
        }

        throw new Error(failure);
    };

    return func()
        .then(result => {
            if (condition(result)) {
                return result;
            }

            return retry();
        },
        retry);
}
