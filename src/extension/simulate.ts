// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {Hash} from "../utils/hash";
import * as http from "http";
import * as Q from "q";
import * as cordovaServer from "cordova-serve";
import * as path from "path";
import {Simulator, SimulateOptions, launchBrowser} from "cordova-simulate";
import {CordovaSimulateTelemetry} from "../utils/cordovaSimulateTelemetry";
import {IProjectType, CordovaProjectHelper} from '../utils/cordovaProjectHelper';
import {SimulationInfo} from '../common/simulationInfo';
import * as vscode from "vscode";

/**
 * Plugin simulation entry point.
 */
export class PluginSimulator implements vscode.Disposable {
    private registration: vscode.Disposable;
    private simulateProtocol: string;
    private simulateUri: vscode.Uri;
    private defaultSimulateTempDir: string;

    private simulator: Simulator;
    private simulationInfo: SimulationInfo;

    constructor() {
        this.simulateProtocol = "cordova-simulate-" + Hash.hashCode(vscode.workspace.rootPath);
        this.simulateUri = vscode.Uri.parse(this.simulateProtocol + "://authority/cordova-simulate");
        this.defaultSimulateTempDir = path.join(vscode.workspace.rootPath, ".vscode", "simulate");
    }

    public simulate(simulateOptions: SimulateOptions, projectType: IProjectType): Q.Promise<any> {
        return this.launchServer(simulateOptions, projectType)
            .then(() => this.launchAppHost(simulateOptions.target))
            .then(() => this.launchSimHost());
    }

    public launchAppHost(target: string): Q.Promise<void> {
        return launchBrowser(target, this.simulationInfo.appHostUrl);
    }

    public launchSimHost(): Q.Promise<void> {
        if (!this.simulator) {
            return Q.reject<void>(new Error("Launching sim host before starting simulation server"));
        }
        let provider = new SimHostContentProvider(this.simulator.simHostUrl(), this.simulateUri);
        this.registration = vscode.workspace.registerTextDocumentContentProvider(this.simulateProtocol, provider);

        return Q(vscode.commands.executeCommand("vscode.previewHtml", this.simulateUri, vscode.ViewColumn.Two).then(() => provider.fireChange()));
    }

    public launchServer(simulateOptions: SimulateOptions, projectType: IProjectType): Q.Promise<SimulationInfo> {
        simulateOptions.dir = vscode.workspace.rootPath;
        if (!simulateOptions.simulationpath) {
            simulateOptions.simulationpath = this.defaultSimulateTempDir;
        }

        return Q({}).then(() => {
            if (this.isServerRunning()) {
                /* close the server old instance */
                return this.simulator.stopSimulation();
            }
        })
        .then(() => {
                let simulateTelemetryWrapper = new CordovaSimulateTelemetry();
                simulateOptions.telemetry = simulateTelemetryWrapper;

                this.simulator = new Simulator(simulateOptions);
                let platforms = CordovaProjectHelper.getInstalledPlatforms(vscode.workspace.rootPath);

                let platform = simulateOptions.platform;
                let isPlatformMissing = platform && platforms.indexOf(platform) < 0;

                if (isPlatformMissing) {
                     let command = "cordova";
                     if (projectType.ionic || projectType.ionic2) {
                        command = "ionic cordova";
                     }

                    throw new Error(`Couldn't find platform ${platform} in project, please install it using '${command} platform add ${platform}'`);
                }

                return this.simulator.startSimulation()
                    .then(() => {
                        this.simulationInfo = {
                            appHostUrl: this.simulator.appUrl(),
                            simHostUrl: this.simulator.simHostUrl(),
                            urlRoot: this.simulator.urlRoot(),
                        };
                        if (projectType.ionic2 && platform && platform !== "browser") {
                            this.simulationInfo.appHostUrl = `${this.simulationInfo.appHostUrl}?ionicplatform=${simulateOptions.platform}`
                        }
                        return this.simulationInfo;
                    });
            });
    }

    private isServerRunning(): boolean {
        return this.simulator && this.simulator.isRunning();
    }

    public dispose(): void {
        if (this.registration) {
            this.registration.dispose();
            this.registration = null;
        }

        if (this.simulator) {
            this.simulator.stopSimulation().done(()=>{}, () => {});
            this.simulator = null;
        }
    }
}

/**
 * Content provider hosting the simulation UI inside a document.
 */
class SimHostContentProvider implements vscode.TextDocumentContentProvider {
    private simHostUrl: string;
    private simulateUri: vscode.Uri;
    private changeEmitter = new vscode.EventEmitter<vscode.Uri>();

    constructor(simHostUrl: string, simulateUri: vscode.Uri) {
        this.simHostUrl = simHostUrl;
        this.simulateUri = simulateUri;
    }

    get onDidChange() {
        return this.changeEmitter.event;
    }

    public fireChange() {
        this.changeEmitter.fire(this.simulateUri);
    }

    public provideTextDocumentContent(uri: vscode.Uri): string {
        // always return different html so that the tab is properly reloaded and events are fired
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
                    <div style="display: none">
                        Always be changing ${Math.random()}
                    </div>
                    <div class="intrinsic-container">
                        <iframe src="${this.simHostUrl}" ></iframe>
                    </div>
                </body>
                </html>`;
    }
}
