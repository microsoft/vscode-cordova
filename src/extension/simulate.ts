// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as http from "http";
import * as Q from "q";
import * as cordovaServer from "cordova-serve";
import * as path from "path";
import * as simulate from "cordova-simulate";
import * as vscode from "vscode";

/**
 * Plugin simulation entry point.
 */
export class PluginSimulator implements vscode.Disposable {
    private simulateInfo: simulate.SimulateInfo;
    private registration: vscode.Disposable;
    private simulateUri = vscode.Uri.parse("cordova-simulate://authority/cordova-simulate");
    private target = "chrome";

    public simulate(projectDirectory: string): Q.Promise<any> {
        return this.launchServer(projectDirectory)
            .then(() => this.launchAppHost())
            .then(() => this.launchSimHost());
    }

    public launchAppHost(): Q.Promise<any> {
        return simulate.launchBrowser(this.target, this.simulateInfo.appUrl);
    }

    public launchSimHost(): Q.Promise<any> {
        let provider = new SimHostContentProvider(this.simulateInfo.simHostUrl);
        this.registration = vscode.workspace.registerTextDocumentContentProvider("cordova-simulate", provider);
        return <any>vscode.commands.executeCommand("vscode.previewHtml", this.simulateUri, vscode.ViewColumn.Two);
    }

    public launchServer(projectDirectory: string): Q.Promise<simulate.SimulateInfo> {
        return this.isServerRunning()
            .then((isRunning: boolean) => {
                if (!isRunning) {
                    return simulate.launchServer({ platform: "browser", target: this.target, dir: projectDirectory })
                        .then(simulateInfo => {
                            this.simulateInfo = simulateInfo;
                        });
                }
            }).then(() => {
                return this.simulateInfo;
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

    constructor(simHostUrl) {
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