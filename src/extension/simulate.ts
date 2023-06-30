// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as fs from "fs";
import * as cp from "child_process";
import * as CordovaSimulate from "cordova-simulate";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { CordovaSimulateTelemetry } from "../utils/cordovaSimulateTelemetry";
import { ProjectType, CordovaProjectHelper } from "../utils/cordovaProjectHelper";
import { SimulationInfo } from "../common/simulationInfo";
import { PlatformType } from "../debugger/cordovaDebugSession";
import customRequire from "../common/customRequire";
import { OutputChannelLogger } from "../utils/log/outputChannelLogger";
import { findFileInFolderHierarchy } from "../utils/extensionHelper";
import { ErrorHelper } from "../common/error/errorHelper";
import { InternalErrorCode } from "../common/error/internalErrorCode";
import { TelemetryHelper } from "../utils/telemetryHelper";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export enum SimulateTargets {
    Default = "default",
    Chrome = "chrome",
    Chromium = "chromium",
    Edge = "edge",
    Firefox = "firefox",
    Ie = "ie",
    Opera = "opera",
    Safari = "safari",
}

/**
 * Plugin simulation entry point.
 */
export class PluginSimulator implements vscode.Disposable {
    private registration: vscode.Disposable;

    private simulator: CordovaSimulate.Simulator;
    private simulationInfo: SimulationInfo;
    private readonly CORDOVA_SIMULATE_PACKAGE = "cordova-simulate";
    private simulatePackage: typeof CordovaSimulate;
    private packageInstallProc: cp.ChildProcess | null = null;

    public async simulate(
        fsPath: string,
        simulateOptions: CordovaSimulate.SimulateOptions,
        projectType: ProjectType,
    ): Promise<any> {
        await this.launchServer(fsPath, simulateOptions, projectType);
        await this.launchSimHost(simulateOptions.target);
        return await this.launchAppHost(simulateOptions.target);
    }

    public async launchAppHost(target: string): Promise<void> {
        const simulate = await this.getPackage();
        return await simulate.launchBrowser(target, this.simulationInfo.appHostUrl);
    }

    public async launchSimHost(target: string): Promise<void> {
        if (!this.simulator) {
            const error = ErrorHelper.getInternalError(
                InternalErrorCode.LaunchSimHostBeforeStartSimulationServer,
            );
            TelemetryHelper.sendErrorEvent("LaunchSimHostBeforeStartSimulationServer", error);
            throw error;
        }
        const simulate = await this.getPackage();
        return await simulate.launchBrowser(target, this.simulator.simHostUrl());
    }

    public launchServer(
        fsPath: string,
        simulateOptions: CordovaSimulate.SimulateOptions,
        projectType: ProjectType,
    ): Promise<SimulationInfo> {
        const uri = vscode.Uri.file(fsPath);
        const workspaceFolder = <vscode.WorkspaceFolder>vscode.workspace.getWorkspaceFolder(uri);
        const checkPath = path.join(workspaceFolder.uri.fsPath, ".vscode", "simulate");
        if (fs.existsSync(checkPath)) {
            simulateOptions.dir = workspaceFolder.uri.fsPath;
            if (!simulateOptions.simulationpath) {
                simulateOptions.simulationpath = checkPath;
            }
        } else {
            simulateOptions.dir = fsPath;
            if (!simulateOptions.simulationpath) {
                simulateOptions.simulationpath = path.join(fsPath, ".vscode", "simulate");
            }
        }

        return this.getPackage()
            .then(() => {
                if (this.isServerRunning()) {
                    /* close the server old instance */
                    return this.simulator.stopSimulation();
                }
            })
            .then(() => {
                const simulateTelemetryWrapper = new CordovaSimulateTelemetry();
                simulateOptions.telemetry = simulateTelemetryWrapper;

                this.simulator = new this.simulatePackage.Simulator(simulateOptions);
                const platforms = CordovaProjectHelper.getInstalledPlatforms(simulateOptions.dir);

                const platform = simulateOptions.platform;
                const isPlatformMissing = platform && !platforms.includes(platform);

                if (isPlatformMissing) {
                    let command = "cordova";
                    if (projectType.isIonic) {
                        const isIonicCliVersionGte3 = CordovaProjectHelper.isIonicCliVersionGte3(
                            workspaceFolder.uri.fsPath,
                        );
                        command = `ionic${isIonicCliVersionGte3 ? " cordova" : ""}`;
                    }

                    const error = ErrorHelper.getInternalError(
                        InternalErrorCode.CouldntFindPlatformInProject,
                        platform,
                        command,
                        platform,
                    );
                    TelemetryHelper.sendErrorEvent("CouldntFindPlatformInProject", error);
                    throw error;
                }

                return this.simulator.startSimulation().then(() => {
                    if (!this.simulator.isRunning()) {
                        const error = ErrorHelper.getInternalError(
                            InternalErrorCode.ErrorStartingTheSimulation,
                        );
                        TelemetryHelper.sendErrorEvent("ErrorStartingTheSimulation", error);
                        throw error;
                    }

                    this.simulationInfo = {
                        appHostUrl: this.simulator.appUrl(),
                        simHostUrl: this.simulator.simHostUrl(),
                        urlRoot: this.simulator.urlRoot(),
                    };
                    if (
                        (projectType.ionicMajorVersion === 2 ||
                            projectType.ionicMajorVersion === 3) &&
                        platform &&
                        platform !== PlatformType.Browser
                    ) {
                        this.simulationInfo.appHostUrl = `${this.simulationInfo.appHostUrl}?ionicplatform=${simulateOptions.platform}`;
                    }
                    return this.simulationInfo;
                });
            });
    }

    public dispose(): void {
        if (this.registration) {
            this.registration.dispose();
            this.registration = null;
        }

        if (this.simulator) {
            this.simulator.stopSimulation().then(
                () => {},
                () => {},
            );
            this.simulator = null;
        }
    }

    public getPackage(): Promise<typeof CordovaSimulate> {
        if (this.simulatePackage) {
            return Promise.resolve(this.simulatePackage);
        }
        // Don't do the require if we don't actually need it
        try {
            const simulate = customRequire(this.CORDOVA_SIMULATE_PACKAGE) as typeof CordovaSimulate;
            this.simulatePackage = simulate;
            return Promise.resolve(this.simulatePackage);
        } catch (e) {
            if (e.code === "MODULE_NOT_FOUND") {
                OutputChannelLogger.getMainChannel().log(
                    localize(
                        "CordovaSimulateDepNotPresent",
                        "cordova-simulate dependency not present. Installing it...",
                    ),
                );
            } else {
                throw e;
            }
        }

        return new Promise((resolve, reject) => {
            if (!this.packageInstallProc) {
                this.packageInstallProc = cp.spawn(
                    process.platform === "win32" ? "npm.cmd" : "npm",
                    ["install", this.CORDOVA_SIMULATE_PACKAGE, "--verbose", "--no-save"],
                    {
                        cwd: path.dirname(findFileInFolderHierarchy(__dirname, "package.json")),
                    },
                );

                this.packageInstallProc.once("exit", (code: number) => {
                    if (code === 0) {
                        this.simulatePackage = customRequire(this.CORDOVA_SIMULATE_PACKAGE);
                        resolve(this.simulatePackage);
                    } else {
                        OutputChannelLogger.getMainChannel().log(
                            localize(
                                "ErrorWhileInstallingCordovaSimulateDep",
                                "Error while installing cordova-simulate dependency to the extension",
                            ),
                        );
                        reject(
                            localize(
                                "ErrorWhileInstallingCordovaSimulateDep",
                                "Error while installing cordova-simulate dependency to the extension",
                            ),
                        );
                    }
                });

                let lastDotTime = 0;
                const printDot = () => {
                    const now = Date.now();
                    if (now - lastDotTime > 1500) {
                        lastDotTime = now;
                        OutputChannelLogger.getMainChannel().append(".");
                    }
                };

                this.packageInstallProc.stdout.on("data", () => {
                    printDot();
                });

                this.packageInstallProc.stderr.on("data", (data: Buffer) => {
                    printDot();
                });
            } else {
                const packageCheck = setInterval(() => {
                    if (this.simulatePackage) {
                        clearInterval(packageCheck);
                        resolve(this.simulatePackage);
                    }
                }, 1000);
            }
        });
    }

    private isServerRunning(): boolean {
        return this.simulator && this.simulator.isRunning();
    }
}
