// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import * as nls from "vscode-nls";
import * as vscode from "vscode";
import * as io from "socket.io-client";
import simulate = require("cordova-simulate");
import { EventEmitter } from "vscode";
import { DebugConsoleLogger, PlatformType, TargetType } from "../../debugger/cordovaDebugSession";
import { CordovaProjectHelper } from "../../utils/cordovaProjectHelper";
import AbstractPlatform from "../abstractPlatform";
import { IBrowserPlatformOptions } from "../platformOptions";
import { IBrowserAttachResult } from "../platformAttachResult";
import { SimulationInfo } from "../../common/simulationInfo";
import { IBrowserLaunchResult } from "../platformLaunchResult";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export default class BrowserPlatform extends AbstractPlatform {
    public static readonly CHROME_DATA_DIR = "chrome_sandbox_dir"; // The directory to use for the sandboxed Chrome instance that gets launched to debug the app

    private simulateDebugHost: SocketIOClient.Socket;
    private browserProc: child_process.ChildProcess;

    private browserStopEventEmitter: EventEmitter<Error | undefined> = new EventEmitter();
    public readonly onBrowserStop = this.browserStopEventEmitter.event;

    private changeSimulateViewportEventEmitter: EventEmitter<simulate.ResizeViewportData> =
        new EventEmitter();
    public readonly onChangeSimulateViewport = this.changeSimulateViewportEventEmitter.event;

    constructor(
        protected platformOpts: IBrowserPlatformOptions,
        protected log: DebugConsoleLogger,
    ) {
        super(platformOpts, log);
    }

    public getPlatformOpts(): IBrowserPlatformOptions {
        return this.platformOpts;
    }

    public async launchApp(): Promise<IBrowserLaunchResult> {
        let devServerPort: number;

        if (this.platformOpts.platform === PlatformType.Serve) {
            // Currently, "ionic serve" is only supported for Ionic projects
            if (!this.platformOpts.projectType.isIonic) {
                const errorMessage = localize(
                    "ServingToTheBrowserIsSupportedForIonicProjects",
                    "Serving to the browser is currently only supported for Ionic projects",
                );
                this.log(errorMessage, true);
                throw new Error(errorMessage);
            }
            const serveRunArgs = this.getServeRunArguments();
            const devServersUrls = await this.IonicDevServer.startIonicDevServer(
                serveRunArgs,
                this.platformOpts.env,
            );
            this.platformOpts.url = devServersUrls[0];
        } else {
            const simulatorOptions = this.convertBrowserOptionToSimulateArgs(this.platformOpts);
            const simulateInfo = await this.platformOpts.pluginSimulator.launchServer(
                this.projectRoot,
                simulatorOptions,
                this.platformOpts.projectType,
            );
            await this.connectSimulateDebugHost(simulateInfo);

            // Launch simulate host in browser
            this.launchDebugBrowser(
                this.platformOpts.target,
                `${this.runArguments.toString()} ${simulateInfo.simHostUrl}`,
            );
            this.platformOpts.simulatePort = CordovaProjectHelper.getPortFromURL(
                simulateInfo.appHostUrl,
            );
            this.platformOpts.url = simulateInfo.appHostUrl;
            devServerPort = this.IonicDevServer.getDevServerPort();
        }

        // Launch app host in browser
        this.launchDebugBrowser(
            this.platformOpts.target,
            `${this.runArguments.toString()} ${this.platformOpts.url}`,
        );

        return { devServerPort };
    }

    public async prepareForAttach(): Promise<IBrowserAttachResult> {
        return {};
    }

    public async stopAndCleanUp(): Promise<void> {
        await super.stopAndCleanUp();
        if (this.browserProc) {
            this.browserProc.kill("SIGINT");
            // Workaround for issue https://github.com/microsoft/vscode-cordova/issues/766
            if (this.platformOpts.target === TargetType.Chrome) {
                this.setChromeExitTypeNormal();
            }
            this.browserProc = null;
        }
        // Close the simulate debug-host socket if necessary
        if (this.simulateDebugHost) {
            this.simulateDebugHost.close();
            this.simulateDebugHost = null;
        }

        this.browserStopEventEmitter.dispose();
        this.changeSimulateViewportEventEmitter.dispose();
    }

    public getRunArguments(): string[] {
        const args: string[] = [
            `--remote-debugging-port=${this.platformOpts.port || 9222}`,
            "--no-first-run",
            "--no-default-browser-check",
            `--user-data-dir=${this.platformOpts.userDataDir}`,
        ];
        if (this.platformOpts.runArguments) {
            const runArguments = [...this.platformOpts.runArguments];
            const remoteDebuggingPort = BrowserPlatform.getOptFromRunArgs(
                runArguments,
                "--remote-debugging-port",
            );
            const noFirstRun = BrowserPlatform.getOptFromRunArgs(
                runArguments,
                "--no-first-run",
                true,
            );
            const noDefaultBrowserCheck = BrowserPlatform.getOptFromRunArgs(
                runArguments,
                "--no-default-browser-check",
                true,
            );
            const userDataDir = BrowserPlatform.getOptFromRunArgs(runArguments, "--user-data-dir");

            if (noFirstRun) {
                BrowserPlatform.removeRunArgument(runArguments, "--no-first-run", true);
            }
            if (noDefaultBrowserCheck) {
                BrowserPlatform.removeRunArgument(runArguments, "--no-default-browser-check", true);
            }
            if (remoteDebuggingPort) {
                BrowserPlatform.setRunArgument(
                    args,
                    "--remote-debugging-port",
                    remoteDebuggingPort,
                );
                BrowserPlatform.removeRunArgument(runArguments, "--remote-debugging-port", false);
            }
            if (userDataDir) {
                BrowserPlatform.setRunArgument(args, "--user-data-dir", userDataDir);
                BrowserPlatform.removeRunArgument(runArguments, "--user-data-dir", false);
            }

            args.push(...runArguments);
        }
        if (this.platformOpts.url) {
            args.push(this.platformOpts.url);
        }
        return args;
    }

    private setChromeExitTypeNormal() {
        try {
            const preferencesPath = path.resolve(
                this.platformOpts.userDataDir,
                "Default",
                "Preferences",
            );
            const browserPrefs = JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
            console.log(browserPrefs);
            browserPrefs.profile.exit_type = "normal";
            fs.writeFileSync(preferencesPath, JSON.stringify(browserPrefs));
        } catch {
            // Just ignore possible errors
        }
    }

    private getServeRunArguments(): string[] {
        const args = ["serve"];

        if (this.platformOpts.runArguments && this.platformOpts.runArguments.length > 0) {
            args.push(...this.platformOpts.runArguments);
        } else {
            // Set up "ionic serve" args
            args.push("--no-open");

            if (!this.platformOpts.ionicLiveReload) {
                args.push("--nolivereload");
            }
        }

        return args;
    }

    private connectSimulateDebugHost(simulateInfo: SimulationInfo): Promise<void> {
        // Connect debug-host to cordova-simulate
        return new Promise<void>((resolve, reject) => {
            const simulateConnectErrorHandler = (err: any): void => {
                this.log("Error connecting to the simulated app.", err);
                reject(err);
            };

            this.simulateDebugHost = io.connect(simulateInfo.urlRoot);
            this.simulateDebugHost.on("connect_error", simulateConnectErrorHandler);
            this.simulateDebugHost.on("connect_timeout", simulateConnectErrorHandler);
            this.simulateDebugHost.on("connect", () => {
                this.simulateDebugHost.on(
                    "resize-viewport",
                    (data: simulate.ResizeViewportData) => {
                        this.changeSimulateViewportEventEmitter.fire(data);
                    },
                );
                this.simulateDebugHost.emit("register-debug-host", {
                    handlers: ["resize-viewport"],
                });
                resolve();
            });
        });
    }

    private convertBrowserOptionToSimulateArgs(
        browserOption: IBrowserPlatformOptions,
    ): simulate.SimulateOptions {
        const result: simulate.SimulateOptions = {};

        result.platform = browserOption.platform;
        result.target = browserOption.target;
        result.port = browserOption.simulatePort;
        result.livereload = browserOption.livereload;
        result.forceprepare = browserOption.forcePrepare;
        result.simulationpath = browserOption.simulateTempDir;
        result.corsproxy = browserOption.corsProxy;
        result.livereloaddelay = browserOption.livereloadDelay;
        result.spaurlrewrites = browserOption.spaUrlRewrites;
        result.lang = vscode.env.language;

        return result;
    }

    private launchDebugBrowser(target: string, runArg: string) {
        let args;
        let browser = `${target} ${runArg.toString().replace(/,/g, " ")}`;
        if (process.platform === "darwin") {
            browser = `"Google Chrome" --args ${runArg.toString().replace(/,/g, " ")}`;
        }

        switch (process.platform) {
            case "darwin":
                args = ["open"];
                if (target === "chrome") {
                    args.push("-n");
                }
                args.push("-a", browser);
                break;
            case "win32":
                // eslint-disable-next-line @typescript-eslint/quotes
                args = ['cmd /c start ""', browser];
                break;
            case "linux":
                args = [browser];
                break;
        }

        const command = args.join(" ");
        child_process.exec(command);
    }
}
