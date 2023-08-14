// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import * as nls from "vscode-nls";
import { DebugConsoleLogger, TargetType, WebviewData } from "../../debugger/cordovaDebugSession";
import { CordovaIosDeviceLauncher } from "../../debugger/cordovaIosDeviceLauncher";
import { cordovaRunCommand } from "../../debugger/extension";
import { CordovaProjectHelper } from "../../utils/cordovaProjectHelper";
import { IIosPlatformOptions } from "../platformOptions";
import { IIosAttachResult } from "../platformAttachResult";
import { promiseGet, retryAsync } from "../../utils/extensionHelper";
import IonicDevServer from "../../utils/ionicDevServer";
import { IIosLaunchResult } from "../platformLaunchResult";
import AbstractMobilePlatform from "../abstractMobilePlatform";
import {
    IDebuggableIOSTarget,
    IOSTarget,
    IOSTargetManager,
} from "../../utils/ios/iOSTargetManager";
import { ErrorHelper } from "../../common/error/errorHelper";
import { InternalErrorCode } from "../../common/error/internalErrorCode";
import { TelemetryHelper } from "../../utils/telemetryHelper";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export default class IosPlatform extends AbstractMobilePlatform<IOSTarget, IOSTargetManager> {
    constructor(protected platformOpts: IIosPlatformOptions, protected log: DebugConsoleLogger) {
        super(platformOpts, log);
        this.targetManager = new IOSTargetManager();
    }

    public getPlatformOpts(): IIosPlatformOptions {
        return this.platformOpts;
    }

    public async launchApp(): Promise<IIosLaunchResult> {
        if (this.runArguments.includes("--livereload")) {
            await this.IonicDevServer.startIonicDevServer(this.runArguments, this.platformOpts.env);
            return { devServerPort: this.IonicDevServer.getDevServerPort() };
        }

        // Here we guarantee the existence of the target
        if (!this._target) {
            this._target = await this.getTargetFromRunArgs();
            if (!this._target) {
                this._target = await this.getPreferredTarget();
                this.addTargetToRunArgs(this._target);
            }
        }

        await cordovaRunCommand(
            this.platformOpts.cordovaExecutable ||
                CordovaProjectHelper.getCliCommand(this.projectRoot),
            this.runArguments,
            this.platformOpts.env,
            this.projectRoot,
            this.log,
        );

        if (!this._target.isVirtualTarget) {
            await CordovaIosDeviceLauncher.startDebugProxy(this.platformOpts.iosDebugProxyPort);
        }
        return {};
    }

    public async prepareForAttach(): Promise<IIosAttachResult> {
        const getIosAttachOptions = async (): Promise<IIosAttachResult> => {
            await CordovaIosDeviceLauncher.startWebkitDebugProxy(
                this.platformOpts.port,
                this.platformOpts.webkitRangeMin,
                this.platformOpts.webkitRangeMax,
                this.target,
            );
            const iOSAppPackagePath = await this.getIosAppPackagePath();
            const target = await this.getPreferredTarget();

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
                const endpointsList = JSON.parse(
                    await promiseGet(
                        `http://localhost:${this.platformOpts.port}/json`,
                        localize(
                            "UnableToCommunicateWithiOSWebkitDebugProxy",
                            "Unable to communicate with ios_webkit_debug_proxy",
                        ),
                    ),
                );
                const device = endpointsList.find(entry =>
                    target.isVirtualTarget
                        ? entry.deviceId === "SIMULATOR"
                        : target.id === entry.deviceId,
                );

                // device.url is of the form 'localhost:port'
                targetPort = parseInt(device.url.split(":")[1], 10);
                iOSVersion = target.isVirtualTarget ? target.system : device.deviceOSVersion;
            } catch (e) {
                const error = ErrorHelper.getInternalError(
                    InternalErrorCode.UnableToFindiOSTargetDeviceOrSimulator,
                );
                TelemetryHelper.sendErrorEvent("UnableToFindiOSTargetDeviceOrSimulator", error);
                throw error;
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
                const webViewsList: Array<WebviewData> = JSON.parse(
                    await promiseGet(
                        `http://localhost:${targetPort}/json`,
                        localize(
                            "UnableToCommunicateWithTarget",
                            "Unable to communicate with target",
                        ),
                    ),
                );
                if (webViewsList.length === 0) {
                    const error = ErrorHelper.getInternalError(
                        InternalErrorCode.UnableToFindTargetApp,
                    );
                    TelemetryHelper.sendErrorEvent("UnableToFindTargetApp", error);
                    throw error;
                }
                const cordovaWebview = this.getCordovaWebview(webViewsList, iOSAppPackagePath);
                if (!cordovaWebview.webSocketDebuggerUrl) {
                    const error = ErrorHelper.getInternalError(
                        InternalErrorCode.WebsocketDebuggerUrlIsEmpty,
                    );
                    TelemetryHelper.sendErrorEvent("WebsocketDebuggerUrlIsEmpty", error);
                    throw error;
                }
                webSocketDebuggerUrl = cordovaWebview.webSocketDebuggerUrl;
                if (this.IonicDevServer.ionicDevServerUrls) {
                    devServerAddress = this.IonicDevServer.ionicDevServerUrls.find(
                        url => cordovaWebview.url.indexOf(url) === 0,
                    );
                }
            } catch (e) {
                const error = ErrorHelper.getInternalError(InternalErrorCode.UnableToFindTargetApp);
                TelemetryHelper.sendErrorEvent("UnableToFindTargetApp", error);
                throw error;
            }

            if (devServerAddress) {
                devServerAddress = url.parse(devServerAddress).hostname;
            }

            return { iOSAppPackagePath, iOSVersion, devServerAddress, webSocketDebuggerUrl };
        };

        return retryAsync<IIosAttachResult>(
            getIosAttachOptions,
            () => true,
            this.platformOpts.attachAttempts,
            1,
            this.platformOpts.attachDelay,
            ErrorHelper.getInternalError(InternalErrorCode.UnableToFindWebview).message,
            this.platformOpts.cancellationTokenSource.token,
        );
    }

    public async stopAndCleanUp(): Promise<void> {
        await super.stopAndCleanUp();
        CordovaIosDeviceLauncher.cleanup();
    }

    public getRunArguments(): string[] {
        const args: string[] = ["run", "ios"];

        // Workaround for dealing with new build system in XCode 10
        // https://github.com/apache/cordova-ios/issues/407
        this.addBuildFlagToArgs(args);

        if (this.platformOpts.runArguments && this.platformOpts.runArguments.length > 0) {
            args.push(...this.platformOpts.runArguments);
        } else {
            switch (this.platformOpts.target) {
                case undefined:
                    break;
                case TargetType.Device:
                    args.push("--device");
                    break;
                case TargetType.Emulator:
                    args.push("--emulator");
                    break;
                default:
                    args.push(`--target=${this.platformOpts.target}`);
            }
        }
        // Verify if we are using Ionic livereload
        if (this.platformOpts.ionicLiveReload) {
            if (this.platformOpts.projectType.isIonic) {
                // Livereload is enabled, let Ionic do the launch
                // '--external' parameter is required since for iOS devices, port forwarding is not yet an option (https://github.com/ionic-team/native-run/issues/20)
                args.push("--livereload", "--external");
            } else {
                this.log(IonicDevServer.NO_LIVERELOAD_WARNING);
            }
        }
        return args;
    }

    public async getTargetFromRunArgs(): Promise<IOSTarget> {
        if (this.platformOpts.runArguments && this.platformOpts.runArguments.length > 0) {
            const targetId = AbstractMobilePlatform.getOptFromRunArgs(
                this.platformOpts.runArguments,
                "--target",
            );

            if (targetId) {
                const targets = await this.targetManager.getTargetList();
                const target = targets.find(
                    target => target.id === targetId || target.name === targetId,
                );
                if (target) {
                    return new IOSTarget(target);
                }
                this.log(
                    localize(
                        "ThereIsNoIosTargetWithSuchUdid",
                        "There is no iOS target with such UDID or name: {0}",
                        targetId,
                    ),
                );
            }
        }

        return undefined;
    }

    protected async getFirstAvailableOnlineTarget(): Promise<IOSTarget> {
        return new IOSTarget((await this.getFirstDebuggableTarget()) as IDebuggableIOSTarget);
    }

    protected addTargetToRunArgs(target: IOSTarget): void {
        if (this.platformOpts.projectType.isIonic) {
            this.platformOpts.target = target.id;
        } else {
            this.platformOpts.target = target.simIdentifier;
        }
        this.runArguments = this.getRunArguments();
    }

    private addBuildFlagToArgs(runArgs: Array<string> = []): Array<string> {
        const hasBuildFlag = runArgs.findIndex(arg => arg.includes("--buildFlag")) > -1;

        if (!hasBuildFlag) {
            runArgs.push("--buildFlag=-UseModernBuildSystem=0");
        }

        return runArgs;
    }

    private getCordovaWebview(
        webViewsList: Array<WebviewData>,
        iOSAppPackagePath: string,
    ): WebviewData {
        const cordovaWebview = webViewsList.find(webviewData => {
            if (webviewData.url.includes(iOSAppPackagePath)) {
                return true;
            }
            if (!this.platformOpts.ionicLiveReload && webviewData.url.startsWith("ionic://")) {
                return true;
            }
            if (this.IonicDevServer.ionicDevServerUrls) {
                return (
                    this.IonicDevServer.ionicDevServerUrls.findIndex(
                        url => webviewData.url.indexOf(url) === 0,
                    ) >= 0
                );
            }
            return false;
        });
        return cordovaWebview || webViewsList[0];
    }

    private async getIosAppPackagePath() {
        if (this.platformOpts.target.toLowerCase() === TargetType.Device) {
            const packageId = await CordovaIosDeviceLauncher.getBundleIdentifier(this.projectRoot);
            return CordovaIosDeviceLauncher.getPathOnDevice(packageId);
        }

        let entries;
        const simulatorBuildPath = path.join(
            this.projectRoot,
            "platforms",
            "ios",
            "build",
            "Debug-iphonesimulator",
        );
        if (fs.existsSync(simulatorBuildPath)) {
            entries = await fs.promises.readdir(
                path.join(this.projectRoot, "platforms", "ios", "build", "Debug-iphonesimulator"),
            );
        } else {
            entries = await fs.promises.readdir(
                path.join(this.projectRoot, "platforms", "ios", "build", "emulator"),
            );
        }

        // TODO requires changes in case of implementing debugging on iOS simulators
        const filtered = entries.filter(entry => /\.app$/.test(entry));
        if (filtered.length > 0) {
            return filtered[0];
        }
        const error = ErrorHelper.getInternalError(InternalErrorCode.CouldNotFindiOSAppFile);
        TelemetryHelper.sendErrorEvent("CouldNotFindiOSAppFile", error);
        throw error;
    }
}
