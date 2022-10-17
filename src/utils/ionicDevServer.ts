// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as nls from "vscode-nls";
import * as os from "os";
import * as child_process from "child_process";
import AbstractPlatform from "../extension/abstractPlatform";
import { CordovaProjectHelper } from "./cordovaProjectHelper";
import { cordovaStartCommand, killChildProcess } from "../debugger/extension";
import { DebugConsoleLogger } from "../debugger/cordovaDebugSession";
import { EventEmitter } from "vscode";
import { ErrorHelper } from "../common/error/errorHelper";
import { InternalErrorCode } from "../common/error/internalErrorCode";
nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export enum IonicDevServerStatus {
    ServerReady,
    AppReady,
}

interface SeverOutput {
    serverOut: string;
    serverErr: string;
}

export default class IonicDevServer {
    public static readonly NO_LIVERELOAD_WARNING = localize(
        "IonicLiveReloadIsOnlySupportedForIonic1",
        "Warning: Ionic live reload is currently only supported for Ionic 1 projects. Continuing deployment without Ionic live reload...",
    );

    private static readonly ERROR_REGEX: RegExp = /error:.*/i;
    private static readonly ANSI_REGEX: RegExp =
        /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

    public ionicDevServerUrls: string[] | undefined;
    private ionicLivereloadProcess: child_process.ChildProcess;

    private isIonic4: boolean;
    private serverReady: boolean = false;
    private appReady: boolean = false;
    private appReadyTimeout: number;

    private serverStopEventEmitter: EventEmitter<Error | undefined> = new EventEmitter();
    public readonly onServerStop = this.serverStopEventEmitter.event;

    constructor(
        private projectRoot: string,
        private log: DebugConsoleLogger,
        private devServerAddress?: string,
        private devServerPort?: number,
        private serverReadyTimeout?: number,
        private cordovaExecutable?: string,
    ) {
        if (this.devServerPort < 0 || this.devServerPort > 65535) {
            new Error(
                localize(
                    "TheValueForDevServerPortMustBeInInterval",
                    "The value for `devServerPort` must be a number between 0 and 65535",
                ),
            );
        }
        this.isIonic4 = CordovaProjectHelper.isIonicCliVersionGte(projectRoot, "4.0.0");
        this.serverReadyTimeout = serverReadyTimeout | 60000;
        this.appReadyTimeout = serverReadyTimeout | 120000;
    }

    public getDevServerPort(): number | undefined {
        return this.devServerPort;
    }

    /**
     * Starts an Ionic livereload server ("serve" or "run / emulate --livereload"). Returns a promise fulfilled with the full URL to the server.
     */
    public async startIonicDevServer(runArguments: string[], allEnv: any): Promise<string[]> {
        if (this.devServerAddress) {
            AbstractPlatform.setRunArgument(runArguments, "--address", this.devServerAddress);
        }
        if (this.devServerPort) {
            AbstractPlatform.setRunArgument(runArguments, "--port", this.devServerPort.toString());
        }

        const command =
            this.cordovaExecutable || CordovaProjectHelper.getCliCommand(this.projectRoot);
        this.ionicLivereloadProcess = cordovaStartCommand(
            command,
            runArguments,
            allEnv,
            this.projectRoot,
        );
        const output: SeverOutput = {
            serverOut: "",
            serverErr: "",
        };
        const isServe: boolean = runArguments[0] === "serve";

        const ionicDevServerUrls = await new Promise<string[]>((resolve, reject) => {
            let rejectTimeout = setTimeout(() => {
                reject(
                    localize(
                        "StartingIonicDevServerTimedOut",
                        "Starting the Ionic dev server timed out ({0} ms)",
                        this.serverReadyTimeout,
                    ),
                );
            }, this.serverReadyTimeout);
            const resolveIfPossible = (ready: IonicDevServerStatus, serverUrls?: string[]) => {
                if (ready === IonicDevServerStatus.ServerReady && !this.serverReady) {
                    clearTimeout(rejectTimeout);
                    this.serverReady = true;
                    this.log("Building and deploying app");
                    rejectTimeout = setTimeout(() => {
                        reject(
                            localize(
                                "BuildingAndDeployingTheAppTimedOut",
                                "Building and deploying the app timed out ({0} ms)",
                                this.appReadyTimeout,
                            ),
                        );
                    }, this.appReadyTimeout);
                } else if (ready === IonicDevServerStatus.AppReady && this.serverReady) {
                    clearTimeout(rejectTimeout);
                    this.appReady = true;
                    resolve(serverUrls);
                }
            };
            const outputHandler: (data: Buffer) => void = this.serverOutputHandler.bind(
                this,
                output,
                isServe,
                this.getRegexToResolveAppDefer(runArguments),
                resolveIfPossible,
                reject,
            );
            const errorOutputHandler: (data: Buffer) => void = this.serverErrorOutputHandler.bind(
                this,
                output,
                reject,
            );

            this.ionicLivereloadProcess.on("error", (err: { code: string }) => {
                if (err.code === "ENOENT") {
                    reject(
                        new Error(
                            localize(
                                "IonicNotFound",
                                "Ionic not found, please run 'npm install –g ionic' to install it globally",
                            ),
                        ),
                    );
                } else {
                    reject(err);
                }
            });
            this.ionicLivereloadProcess.on("exit", () => {
                this.ionicLivereloadProcess = null;

                let exitMessage: string = "The Ionic live reload server exited unexpectedly";
                const errorMsg = this.getServerErrorMessage(output.serverErr);

                if (errorMsg) {
                    // The Ionic live reload server has an error; check if it is related to the devServerAddress to give a better message
                    if (
                        errorMsg.indexOf("getaddrinfo ENOTFOUND") !== -1 ||
                        errorMsg.indexOf("listen EADDRNOTAVAIL") !== -1
                    ) {
                        exitMessage +=
                            os.EOL +
                            localize(
                                "InvalidAddress",
                                "Invalid address: please provide a valid IP address or hostname for the `devServerAddress` property in launch.json",
                            );
                    } else {
                        exitMessage += os.EOL + errorMsg;
                    }
                }

                const error = new Error(exitMessage);

                if (!this.serverReady && !this.appReady) {
                    // We are already debugging; disconnect the session
                    this.log(exitMessage, true);
                    this.serverStopEventEmitter.fire(error);
                    throw error;
                } else {
                    // The Ionic dev server wasn't ready yet, so reject its promises
                    reject(error);
                }
            });
            this.ionicLivereloadProcess.stdout.on("data", outputHandler);
            this.ionicLivereloadProcess.stderr.on("data", (data: Buffer) => {
                if (this.isIonic4) {
                    // Ionic 4 writes all logs to stderr completely ignoring stdout
                    outputHandler(data);
                }
                errorOutputHandler(data);
            });

            this.log(
                localize(
                    "StartingIonicDevServer",
                    "Starting Ionic dev server (live reload: {0})",
                    runArguments.includes("--livereload"),
                ),
            );
        });

        if (!ionicDevServerUrls || !ionicDevServerUrls.length) {
            throw ErrorHelper.getInternalError(
                InternalErrorCode.UnableToDetermineTheIonicDevServerAddress,
            );
        }

        // When ionic 2 cli is installed, output includes ansi characters for color coded output.
        this.ionicDevServerUrls = ionicDevServerUrls.map(url =>
            url.replace(IonicDevServer.ANSI_REGEX, ""),
        );
        return this.ionicDevServerUrls;
    }

    public async stopAndCleanUp(): Promise<void> {
        // Clear the Ionic dev server URL if necessary
        if (this.ionicDevServerUrls) {
            this.ionicDevServerUrls = null;
        }

        if (this.ionicLivereloadProcess) {
            this.ionicLivereloadProcess.removeAllListeners("exit");
            try {
                await killChildProcess(this.ionicLivereloadProcess);
            } finally {
                this.ionicLivereloadProcess = null;
            }
        }

        this.serverStopEventEmitter.dispose();
    }

    private serverOutputHandler(
        output: SeverOutput,
        isServe: boolean,
        regexp: RegExp,
        resolve: (ready: IonicDevServerStatus, serverUrls?: string[]) => void,
        reject: (err: Error | string | void) => void,
        data: Buffer,
    ): void {
        output.serverOut += data.toString();
        this.log(data.toString(), "stdout");

        // Listen for the server to be ready. We check for the "Running dev server:  http://localhost:<port>/" and "dev server running: http://localhost:<port>/" strings to decide that.

        // Example output of Ionic 1 dev server:
        //
        // [OK] Development server running!
        //      Local: http://localhost:8100
        //      External: http://10.0.75.1:8100, http://172.28.124.161:8100, http://169.254.80.80:8100, http://192.169.8.39:8100

        // Example output of Ionic 2 dev server:
        //
        // Running live reload server: undefined
        // Watching: 0=www/**/*, 1=!www/lib/**/*
        // Running dev server:  http://localhost:8100
        // Ionic server commands, enter:
        // restart or r to restart the client app from the root
        // goto or g and a url to have the app navigate to the given url
        // consolelogs or c to enable/disable console log output
        // serverlogs or s to enable/disable server log output
        // quit or q to shutdown the server and exit
        //
        // ionic $

        // Example output of Ionic dev server (for Ionic2):
        //
        // > ionic-hello-world@ ionic:serve <path>
        // > ionic-app-scripts serve "--v2" "--address" "0.0.0.0" "--port" "8100" "--livereload-port" "35729"
        // ionic-app-scripts
        // watch started
        // build dev started
        // clean started
        // clean finished
        // copy started
        // transpile started
        // transpile finished
        // webpack started
        // copy finished
        // webpack finished
        // sass started
        // sass finished
        // build dev finished
        // watch ready
        // dev server running: http://localhost:8100/

        const SERVER_URL_RE =
            /(dev server running|Running dev server|Local):.*(http:\/\/.[^\s]*)/gim;
        const localServerMatchResult = SERVER_URL_RE.exec(output.serverOut);
        if (!this.serverReady && localServerMatchResult) {
            resolve(IonicDevServerStatus.ServerReady);
        }

        if (this.serverReady && !this.appReady) {
            if (isServe || regexp.test(output.serverOut)) {
                const serverUrls = [localServerMatchResult[2]];
                const externalUrls = /External:\s(.*)$/im.exec(output.serverOut);
                if (externalUrls) {
                    const urls = externalUrls[1].split(", ").map(x => x.trim());
                    serverUrls.push(...urls);
                }
                this.devServerPort = CordovaProjectHelper.getPortFromURL(serverUrls[0]);
                resolve(IonicDevServerStatus.AppReady, serverUrls);
            }
        }

        if (/Multiple network interfaces detected/.test(output.serverOut)) {
            // Ionic does not know which address to use for the dev server, and requires human interaction; error out and let the user know
            let errorMessage: string = localize(
                "YourMachineHasMultipleNetworkAddresses",
                `Your machine has multiple network addresses. Please specify which one your device or emulator will use to communicate with the dev server by adding a \"devServerAddress\": \"ADDRESS\" property to .vscode/launch.json.
To get the list of addresses run "ionic cordova run PLATFORM --livereload" (where PLATFORM is platform name to run) and wait until prompt with this list is appeared.`,
            );
            const addresses: string[] = [];
            const addressRegex = /(\d+\) .*)/gm;
            let match: string[] = addressRegex.exec(output.serverOut);

            while (match) {
                addresses.push(match[1]);
                match = addressRegex.exec(output.serverOut);
            }

            if (addresses.length > 0) {
                // Give the user the list of addresses that Ionic found
                // NOTE: since ionic started to use inquirer.js for showing _interactive_ prompts this trick does not work as no output
                // of prompt are sent from ionic process which we starts with --no-interactive parameter
                errorMessage += [localize("AvailableAdresses", " Available addresses:")]
                    .concat(addresses)
                    .join(`${os.EOL} `);
            }

            reject(new Error(errorMessage));
        }

        const errorMsg = this.getServerErrorMessage(output.serverOut);

        if (errorMsg) {
            reject(new Error(errorMsg));
        }
    }

    private serverErrorOutputHandler(
        output: SeverOutput,
        reject: (err: Error | string | void) => void,
        data: Buffer,
    ): void {
        output.serverErr += data.toString();

        const errorMsg = this.getServerErrorMessage(output.serverErr);

        if (errorMsg) {
            reject(new Error(errorMsg));
        }
    }

    private getServerErrorMessage(channel: string): string | null {
        // Skip Ionic 4 searching port errors because, actually, they are not errors
        // https://github.com/ionic-team/ionic-cli/blob/4ee312ad983922ff4398b5900dcfcaebb6ef57df/packages/%40ionic/utils-network/src/index.ts#L85
        if (this.isIonic4) {
            const skipErrorMatch = /utils-network error while checking/.test(channel);
            if (skipErrorMatch) {
                return null;
            }
        }

        const errorMatch = IonicDevServer.ERROR_REGEX.exec(channel);

        if (errorMatch) {
            return localize(
                "ErrorInTheIonicLiveReloadServer",
                "Error in the Ionic live reload server: {0}",
                os.EOL + errorMatch[0],
            );
        }

        return null;
    }

    private getRegexToResolveAppDefer(runArguments: string[]): RegExp {
        // Now that the server is ready, listen for the app to be ready as well. For "serve", this is always true, because no build and deploy is involved. For android, we need to
        // wait until we encounter the "launch success", for iOS device, the server output is different and instead we need to look for:
        //
        // ios devices:
        // (lldb)     run
        // success
        //
        // ios simulators:
        // "build succeeded"

        const isIosDevice: boolean =
            runArguments.indexOf("ios") !== -1 && runArguments.indexOf("--device") !== -1;
        const isIosSimulator: boolean =
            runArguments.indexOf("ios") !== -1 && runArguments.indexOf("emulate") !== -1;
        const iosDeviceAppReadyRegex: RegExp = /created bundle at path|\(lldb\)\W+run\r?\nsuccess/i;
        const iosSimulatorAppReadyRegex: RegExp = /build succeeded/i;
        const appReadyRegex: RegExp = /launch success|run successful/i;

        if (isIosDevice) {
            return iosDeviceAppReadyRegex;
        }

        if (isIosSimulator) {
            return iosSimulatorAppReadyRegex;
        }

        return appReadyRegex;
    }
}
