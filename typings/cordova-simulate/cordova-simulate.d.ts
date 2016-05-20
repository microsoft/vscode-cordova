// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

declare module "cordova-simulate" {
    interface PropertyDictionary {
        [propName: string]: any;
    }

    export interface SimulateOptions {
        platform?: string;
        target?: string;
        port?: number;
        dir?: string;
        simhostui?: string;
        livereload?: boolean;
        forceprepare?: boolean;
        telemetry?: TelemetryModule;
    }

    export interface TelemetryModule {
        sendTelemetry: (eventName: string, props: PropertyDictionary, piiProps: PropertyDictionary) => void;
    }

    export interface SimulateInfo {
        urlRoot: string,
        appUrl: string,
        simHostUrl: string
    }

    export interface ResizeViewportData {
        width: number;
        height: number;
    }

    export function launchBrowser(target: string, url: string): Q.Promise<void>;
    export function launchServer(opts?: SimulateOptions): Q.Promise<SimulateInfo>;
    export function closeServer(): Q.Promise<void>;
}