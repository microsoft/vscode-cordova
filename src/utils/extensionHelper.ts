// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import Q = require("q");
import * as http from "http";

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

export function delay(duration: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, duration));
}

export function promiseGet(url: string, reqErrMessage: string): Q.Promise<string> {
    let deferred = Q.defer<string>();
    let req = http.get(url, function(res) {
        let responseString = "";
        res.on("data", (data: Buffer) => {
            responseString += data.toString();
        });
        res.on("end", () => {
            deferred.resolve(responseString);
        });
    });
    req.on("error", (err: Error) => {
        this.outputLogger(reqErrMessage);
        deferred.reject(err);
    });
    return deferred.promise;
}
