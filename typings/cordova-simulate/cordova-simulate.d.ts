// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

declare module "cordova-simulate" {
    import * as Q from "q";

    function simulate(opts: simulate.SimulateOptions): Q.Promise<simulate.Simulator>;
    module simulate {
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
            simulationpath?: string;
            corsproxy?: boolean;
        }

        export interface TelemetryModule {
            sendTelemetry: (eventName: string, props: PropertyDictionary, piiProps: PropertyDictionary) => void;
        }

        export interface ResizeViewportData {
            width: number;
            height: number;
        }

        export class Simulator {
            constructor(opts: SimulateOptions);
            startSimulation(): Q.Promise<void>;
            stopSimulation(): Q.Promise<void>;

            simHostUrl(): string;
            appUrl(): string;
            urlRoot(): string;
            isRunning(): boolean;
        }

        export function launchBrowser(target: string, url: string): Q.Promise<void>;
        export var dirs: {
            common: string,
            "sim-host": string
        };
        export module log {
            export function log(msg: string): void;
            export function error(error: Error): void;
            export function warning(msg: string): void;
        }

    }

    export = simulate;
}