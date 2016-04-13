// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

declare module "cordova-serve" {
    export interface LaunchBrowserOptions {
        target: string;
        url: string;
    }

    export function launchBrowser(options: LaunchBrowserOptions): Promise<void>;
}