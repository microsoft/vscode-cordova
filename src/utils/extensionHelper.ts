// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as Q from "q";
import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import { CancellationToken } from "vscode";
import { CANCELLATION_ERROR_NAME } from "../debugger/cordovaDebugSession";

export function generateRandomPortNumber() {
    return Math.round(Math.random() * 40000 + 3000);
}

export function retryAsync<T>(func: () => Q.Promise<T>, condition: (result: T) => boolean, maxRetries: number, iteration: number, delay: number, failure: string, cancellationToken?: CancellationToken): Q.Promise<T> {
    const retry = () => {
        if (cancellationToken && cancellationToken.isCancellationRequested) {
            let cancelError = new Error(CANCELLATION_ERROR_NAME);
            cancelError.name = CANCELLATION_ERROR_NAME;
            throw cancelError;
        }
        if (iteration < maxRetries) {
            return Q.delay(delay).then(() => retryAsync(func, condition, maxRetries, iteration + 1, delay, failure, cancellationToken));
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
    let req = http.get(url, function (res) {
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

export function findFileInFolderHierarchy(dir: string, filename: string): string | null {
    let parentPath: string;
    let projectRoot: string = dir;
    let atFsRoot: boolean = false;

    while (!fs.existsSync(path.join(projectRoot, filename))) {
        // Navigate up one level until either config.xml is found
        parentPath = path.resolve(projectRoot, "..");
        if (parentPath !== projectRoot) {
            projectRoot = parentPath;
        } else {
            // we have reached the filesystem root
            atFsRoot = true;
            break;
        }
    }

    if (atFsRoot) {
        // We reached the fs root
        return null;
    }

    return path.join(projectRoot, filename);
}
