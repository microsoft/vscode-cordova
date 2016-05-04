// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

declare module "cordova-simulate" {
    export interface SimulateOptions {
        platform?: string;
        target?: string;
        port?: number;
        dir?: string;
        simhostui?: string;
    }

    export interface SimulateInfo {
        appUrl: string,
        simHostUrl: string
    }

    export function launchBrowser(target: string, url: string): Q.Promise<void>;
    export function launchServer(opts?: SimulateOptions): Q.Promise<SimulateInfo>;
    export function closeServer(): Q.Promise<void>;
}