// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as nls from "vscode-nls";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import { DebugConsoleLogger, TargetType, WebviewData } from "../../debugger/cordovaDebugSession";
import { CordovaIosDeviceLauncher } from "../../debugger/cordovaIosDeviceLauncher";
import { cordovaRunCommand } from "../../debugger/extension";
import { CordovaProjectHelper } from "../../utils/cordovaProjectHelper";
import AbstractPlatform from "../abstractPlatform";
import { IIosPlatformOptions } from "../platformOptions";
import { IIosAttachOptions } from "../platformAttachOptions";
import { promiseGet, retryAsync } from "../../utils/extensionHelper";
import IonicDevServerHelper from "../../utils/ionicDevServerHelper";
nls.config({ messageFormat: nls.MessageFormat.bundle, bundleFormat: nls.BundleFormat.standalone })();
const localize = nls.loadMessageBundle();

export default class IosPlatform extends AbstractPlatform {
    ionicDevServerUrls: any;
    cancellationTokenSource: any;

    constructor(
        protected platformOpts: IIosPlatformOptions,
        protected log: DebugConsoleLogger
    ) {
        super(platformOpts, log);
    }

    public getPlatformOpts(): IIosPlatformOptions {
        return this.platformOpts;
    }

    public async launchApp(): Promise<void> {
        await this.checkIfTargetIsiOSSimulator(this.platformOpts.target);

        if (this.runArguments.includes("--livereload")) {
            await this.ionicDevServerHelper.startIonicDevServer(this.runArguments, this.platformOpts.env);
            return;
        }

        await cordovaRunCommand(
            this.platformOpts.cordovaExecutable || CordovaProjectHelper.getCliCommand(this.projectRoot),
            this.runArguments,
            this.platformOpts.env,
            this.projectRoot,
            this.log,
        );

        await CordovaIosDeviceLauncher.startDebugProxy(this.platformOpts.iosDebugProxyPort);
    }

    public async prepareForAttach(): Promise<IIosAttachOptions> {
        await this.checkIfTargetIsiOSSimulator(this.platformOpts.target);

        const getIosAttachOptions = async (): Promise<IIosAttachOptions> => {
            await CordovaIosDeviceLauncher.startWebkitDebugProxy(this.platformOpts.port, this.platformOpts.webkitRangeMin, this.platformOpts.webkitRangeMax);
            const iOSAppPackagePath = await this.getIosAppPackagePath();

            let targetPort: number;
            let iOSVersion: string;
            let devServerAddress: string | undefined;
            let webSocketDebuggerUrl: string;

            try {
                // An example of a json response from IWDP
                // [{
                //     "deviceId": "00008020-XXXXXXXXXXXXXXXX",
                //     "deviceName": "iPhone name",
                //     "deviceOSVersion": "13.4.1",
                //     "url": "localhost:9223"
                //  }]
                let endpointsList = JSON.parse(await promiseGet(`http://localhost:${this.platformOpts.port}/json`, localize("UnableToCommunicateWithiOSWebkitDebugProxy", "Unable to communicate with ios_webkit_debug_proxy")));
                let devices = endpointsList.filter((entry) =>
                    this.platformOpts.target.toLowerCase() === TargetType.Device ? entry.deviceId !== "SIMULATOR"
                        : entry.deviceId === "SIMULATOR"
                );
                let device = devices[0];
                // device.url is of the form 'localhost:port'
                targetPort = parseInt(device.url.split(":")[1], 10);
                iOSVersion = device.deviceOSVersion;
            } catch (e) {
                throw new Error(localize("UnableToFindiOSTargetDeviceOrSimulator", "Unable to find iOS target device/simulator. Please check that \"Settings > Safari > Advanced > Web Inspector = ON\" or try specifying a different \"port\" parameter in launch.json"));
            }

            try {
                // An example of a json response from IWDP
                // [{
                //     "devtoolsFrontendUrl": "",
                //     "faviconUrl": "",
                //     "thumbnailUrl": "/thumb/ionic://localhost/tabs/tab1",
                //     "title": "Ionic App",
                //     "url": "ionic://localhost/tabs/tab1",
                //     "webSocketDebuggerUrl": "ws://localhost:9223/devtools/page/1",
                //     "appId": "PID:37819"
                //  }]
                const webviewsList: Array<WebviewData> = JSON.parse(await promiseGet(`http://localhost:${targetPort}/json`, localize("UnableToCommunicateWithTarget", "Unable to communicate with target")));
                if (webviewsList.length === 0) {
                    throw new Error(localize("UnableToFindTargetApp", "Unable to find target app"));
                }
                const cordovaWebview = this.getCordovaWebview(webviewsList, iOSAppPackagePath);
                if (!cordovaWebview.webSocketDebuggerUrl) {
                    throw new Error(localize("WebsocketDebuggerUrlIsEmpty", "WebSocket Debugger Url is empty"));
                }
                webSocketDebuggerUrl = cordovaWebview.webSocketDebuggerUrl;
                if (this.ionicDevServerHelper.ionicDevServerUrls) {
                    devServerAddress = this.ionicDevServerHelper.ionicDevServerUrls.find(url => cordovaWebview.url.indexOf(url) === 0);
                }
            } catch (e) {
                throw new Error(localize("UnableToFindTargetApp", "Unable to find target app"));
            }

            if (devServerAddress) {
                devServerAddress = url.parse(devServerAddress).hostname;
            }

            return { iOSAppPackagePath, iOSVersion, devServerAddress, webSocketDebuggerUrl };
        };

        return retryAsync<IIosAttachOptions>(getIosAttachOptions, () => true, this.platformOpts.attachAttempts, 1, this.platformOpts.attachDelay, localize("UnableToFindWebview", "Unable to find Webview"), this.platformOpts.cancellationTokenSource.token);
    }

    public async stopAndCleanUp(): Promise<void> {
        CordovaIosDeviceLauncher.cleanup();
    }

    public getRunArguments(): string[] {
        let args: string[] = [this.platformOpts.target === TargetType.Device ? "run" : "emulate", "ios"];

        if (this.platformOpts.runArguments && this.platformOpts.runArguments.length > 0) {
            args.push(...this.platformOpts.runArguments);
        } else {
            if (this.platformOpts.target !== TargetType.Device && this.platformOpts.target !== TargetType.Emulator)
            args.push("--target=" + this.platformOpts.target);
        }
        this.addBuildFlagToArgs(args);
        // Verify if we are using Ionic livereload
        if (this.platformOpts.ionicLiveReload) {
            if (CordovaProjectHelper.isIonicAngularProjectByProjectType(this.platformOpts.projectType)) {
                // Livereload is enabled, let Ionic do the launch
                // '--external' parameter is required since for iOS devices, port forwarding is not yet an option (https://github.com/ionic-team/native-run/issues/20)
                args.push("--livereload", "--external");
            } else {
                this.log(IonicDevServerHelper.NO_LIVERELOAD_WARNING);
            }
        }
        return args;
    }

    private addBuildFlagToArgs(runArgs: Array<string> = []): Array<string> {
        const hasBuildFlag = runArgs.findIndex((arg) => arg.includes("--buildFlag")) > -1;

        if (!hasBuildFlag) {
            // Workaround for dealing with new build system in XCode 10
            // https://github.com/apache/cordova-ios/issues/407

            runArgs.unshift("--buildFlag=-UseModernBuildSystem=0");
        }

        return runArgs;
    }

    private getCordovaWebview(webviewsList: Array<WebviewData>, iOSAppPackagePath: string): WebviewData {
        let cordovaWebview = webviewsList.find(webviewData => {
            if (webviewData.url.includes(iOSAppPackagePath)) {
                return true;
            }
            if (!this.platformOpts.ionicLiveReload && webviewData.url.startsWith("ionic://")) {
                return true;
            }
            if (this.ionicDevServerUrls) {
                return this.ionicDevServerUrls.findIndex(url => webviewData.url.indexOf(url) === 0) >= 0;
            }
            return false;
        });
        return cordovaWebview || webviewsList[0];
    }

    private async getIosAppPackagePath() {
        if (this.platformOpts.target.toLowerCase() === TargetType.Device) {
            const packageId = await CordovaIosDeviceLauncher.getBundleIdentifier(this.projectRoot);
            return CordovaIosDeviceLauncher.getPathOnDevice(packageId);
        } else {
            const entries = await fs.promises.readdir(path.join(this.projectRoot, "platforms", "ios", "build", "emulator"));
            // TODO requires changes in case of implementing debugging on iOS simulators
            let filtered = entries.filter((entry) => /\.app$/.test(entry));
            if (filtered.length > 0) {
                return filtered[0];
            } else {
                throw new Error(localize("UnableToFindAppFile", "Unable to find .app file"));
            }
        }
    }

    private async checkIfTargetIsiOSSimulator(target?: string): Promise<void> {
        if (target) {
            const simulatorTargetIsNotSupported = () => {
                const message = localize("InvalidTargetPleaseCheckTargetParameter", "Invalid target. Please, check target parameter value in your debug configuration and make sure it's a valid iPhone device identifier. Proceed to https://aka.ms/AA3xq86 for more information.");
                throw new Error(message);
            };
            if (target === TargetType.Emulator) {
                simulatorTargetIsNotSupported();
            }
            const output = await cordovaRunCommand(this.platformOpts.cordovaExecutable || CordovaProjectHelper.getCliCommand(this.projectRoot), ["emulate", "ios", "--list"], this.platformOpts.env, this.projectRoot);
            // Get list of emulators as raw strings
            output[0] = output[0].replace(/Available iOS Simulators:/, "");
            // Clean up each string to get real value
            const emulators = output[0].split("\n").map((value) => {
                let match = value.match(/(.*)(?=,)/gm);
                if (!match) {
                    return null;
                }
                return match[0].replace(/\t/, "");
            });
            if (emulators.indexOf(target) >= 0) {
                simulatorTargetIsNotSupported();
            }
        }
    }
}
