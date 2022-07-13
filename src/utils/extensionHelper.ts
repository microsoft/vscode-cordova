// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import { CancellationToken } from "vscode";
import CordovaDebugSession from "../debugger/cordovaDebugSession";

export function generateRandomPortNumber(): number {
    return Math.round(Math.random() * 40000 + 3000);
}

export function retryAsync<T>(
    func: () => Promise<T>,
    condition: (result: T) => boolean,
    maxRetries: number,
    iteration: number,
    delayTime: number,
    failure: string,
    cancellationToken?: CancellationToken,
): Promise<T> {
    const retry = () => {
        if (cancellationToken && cancellationToken.isCancellationRequested) {
            const cancelError = new Error(CordovaDebugSession.CANCELLATION_ERROR_NAME);
            cancelError.name = CordovaDebugSession.CANCELLATION_ERROR_NAME;
            throw cancelError;
        }
        if (iteration < maxRetries) {
            return delay(delayTime).then(() =>
                retryAsync(
                    func,
                    condition,
                    maxRetries,
                    iteration + 1,
                    delayTime,
                    failure,
                    cancellationToken,
                ),
            );
        }

        throw new Error(failure);
    };

    return func().then(result => {
        if (condition(result)) {
            return result;
        }

        return retry();
    }, retry);
}

export function delay(duration: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, duration)); // eslint-disable-line
}

export function promiseGet(url: string, reqErrMessage: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            const err = new Error("Request timeout");
            req.destroy(err); // eslint-disable-line
            reject(err);
        }, 9500);

        const req = http.get(url, function (res) {
            let responseString = "";
            res.on("data", (data: Buffer) => {
                responseString += data.toString();
            });
            res.on("end", () => {
                clearTimeout(timeout);
                resolve(responseString);
            });
        });

        req.on("error", (err: Error) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

export function findFileInFolderHierarchy(dir: string, filename: string): string | null {
    let parentPath: string;
    let projectRoot: string = dir;
    let atFsRoot = false;

    while (!fs.existsSync(path.join(projectRoot, filename))) {
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

export function isNullOrUndefined(value: any): boolean {
    return typeof value === "undefined" || value === null;
}
