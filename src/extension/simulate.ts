// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {Hash} from "../utils/hash";
import * as http from "http";
import * as Q from "q";
import * as cordovaServer from "cordova-serve";
import * as path from "path";
import * as simulate from "cordova-simulate";
import {CordovaSimulateTelemetry} from "../utils/cordovaSimulateTelemetry";
import * as vscode from "vscode";

/**
 * Plugin simulation entry point.
 */
export class PluginSimulator implements vscode.Disposable {
    private simulateInfo: simulate.SimulateInfo;
    private registration: vscode.Disposable;
    private simulateProtocol: string;
    private simulateUri: vscode.Uri;
    private defaultSimulateTempDir: string;

    constructor() {
        this.simulateProtocol = "cordova-simulate-" + Hash.hashCode(vscode.workspace.rootPath);
        this.simulateUri = vscode.Uri.parse(this.simulateProtocol + "://authority/cordova-simulate");
        this.defaultSimulateTempDir = path.join(vscode.workspace.rootPath, ".vscode", "simulate");
    }

    public simulate(simulateOptions: simulate.SimulateOptions): Q.Promise<any> {
        return this.launchServer(simulateOptions)
            .then(() => this.launchAppHost(simulateOptions.target))
            .then(() => this.launchSimHost());
    }

    public launchAppHost(target: string): Q.Promise<void> {
        return simulate.launchBrowser(target, this.simulateInfo.appUrl);
    }

    public launchSimHost(): Q.Promise<void> {
        let provider = new SimHostContentProvider(this.simulateInfo.simHostUrl);
        this.registration = vscode.workspace.registerTextDocumentContentProvider(this.simulateProtocol, provider);

        return Q(vscode.commands.executeCommand("vscode.previewHtml", this.simulateUri, vscode.ViewColumn.Two).then(() => void 0));
    }

    public launchServer(simulateOptions: simulate.SimulateOptions): Q.Promise<simulate.SimulateInfo> {
        simulateOptions.dir = vscode.workspace.rootPath;
        if (!simulateOptions.simulationpath) {
            simulateOptions.simulationpath = this.defaultSimulateTempDir;
        }

        return this.isServerRunning()
            .then((isRunning: boolean) => {
                if (isRunning) {
                    /* close the server old instance */
                    return Q({})
                    .then(()=> simulate.stopSimulate());
                }
            }).then(() => {
                let simulateTelemetryWrapper = new CordovaSimulateTelemetry();
                simulateOptions.telemetry = simulateTelemetryWrapper;

                return simulate.launchServer(simulateOptions)
                    .then(simulateInfo => {
                        this.simulateInfo = simulateInfo;
                        return this.simulateInfo;
                    });
            });
    }

    private isServerRunning(): Q.Promise<boolean> {
        let deferred = Q.defer<boolean>();
        if (this.simulateInfo) {
            http.get(this.simulateInfo.simHostUrl, function (res) {
                deferred.resolve(true);
                res.resume();
            }).on("error", (err: Error) => {
                deferred.resolve(false);
            });
        } else {
            deferred.resolve(false);
        }
        return deferred.promise;
    }

    public dispose(): void {
        if (this.registration) {
            this.registration.dispose();
            this.registration = null;
        }

        this.simulateInfo = null;
        simulate.closeServer();
    }
}

/**
 * Content provider hosting the simulation UI inside a document.
 */
class SimHostContentProvider implements vscode.TextDocumentContentProvider {
    private simHostUrl: string;

    constructor(simHostUrl: string) {
        this.simHostUrl = simHostUrl;
    }

    public provideTextDocumentContent(uri: vscode.Uri): string {
        return `<!DOCTYPE html>
                <html>
                <head>
                    <style>
                        html, body {
                            height: 100%;
                            margin: 0;
                            overflow: hidden;
                        }

                        .intrinsic-container iframe {
                            position: absolute;
                            top:0;
                            left: 0;
                            border: 0;
                            width: 100%;
                            height: 100%;
                        }
                    </style>
                </head>
                <body>
                    <div class="intrinsic-container">
                        <iframe src="${this.simHostUrl}" ></iframe>
                    </div>
                </body>
                </html>`;
    }
}