// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as http from "http";
import * as Q from "q";
import * as cordovaServer from "cordova-serve";
import * as path from "path";
import * as simulate from "taco-simulate";
import * as vscode from "vscode";

/**
 * Plugin simulation entry point.
 */
export class PluginSimulator implements vscode.Disposable {
    private simulateInfo: simulate.SimulateInfo;
    private registration: vscode.Disposable;
    private simulateUri = vscode.Uri.parse("browser-simulate://authority/browser-simulate");
    private target = "chrome";

    public simulate(projectDirectory: string): Q.Promise<any> {
        return this.launchServer(this.target, projectDirectory)
            .then(() => this.launchHosts(this.target));
    }

    private launchHosts(target: string): Q.Promise<any> {
        return simulate.launchBrowser(target, this.simulateInfo.appUrl)
            .then(() => {
                let provider = new SimHostContentProvider(this.simulateInfo.simHostUrl);
                this.registration = vscode.workspace.registerTextDocumentContentProvider("browser-simulate", provider);
                return vscode.commands.executeCommand('vscode.previewHtml', this.simulateUri, vscode.ViewColumn.Two);
            });
    }

    private launchServer(target: string, projectDirectory: string): Q.Promise<void> {
        return this.isServerRunning().then((isRunning: boolean) => {
            if (!isRunning) {
                return simulate.launchServer({ platform: "browser", target: target, dir: projectDirectory })
                    .then(simulateInfo => { this.simulateInfo = simulateInfo });
            }
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