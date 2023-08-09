// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as fs from "fs";
import * as path from "path";
import * as nls from "vscode-nls";
import * as elementtree from "elementtree";
import { AdbHelper } from "../../utils/android/adb";
import { IAndroidPlatformOptions } from "../platformOptions";
import AbstractMobilePlatform from "../abstractMobilePlatform";
import { CordovaProjectHelper } from "../../utils/cordovaProjectHelper";
import { cordovaRunCommand } from "../../debugger/extension";
import { DebugConsoleLogger } from "../../debugger/cordovaDebugSession";
import { AndroidTarget, AndroidTargetManager } from "../../utils/android/androidTargetManager";
import { retryAsync } from "../../utils/extensionHelper";
import AbstractPlatform from "../abstractPlatform";
import IonicDevServer from "../../utils/ionicDevServer";
import { IAndroidAttachResult } from "../platformAttachResult";
import { IAndroidLaunchResult } from "../platformLaunchResult";
import { ErrorHelper } from "../../common/error/errorHelper";
import { InternalErrorCode } from "../../common/error/internalErrorCode";
import { TelemetryHelper } from "../../utils/telemetryHelper";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export default class AndroidPlatform extends AbstractMobilePlatform<
    AndroidTarget,
    AndroidTargetManager
> {
    private static readonly ANDROID_MANIFEST_PATH = path.join(
        "platforms",
        "android",
        "AndroidManifest.xml",
    );
    private static readonly ANDROID_MANIFEST_PATH_8 = path.join(
        "platforms",
        "android",
        "app",
        "src",
        "main",
        "AndroidManifest.xml",
    );

    private adbHelper: AdbHelper;

    constructor(
        protected platformOpts: IAndroidPlatformOptions,
        protected log: DebugConsoleLogger,
    ) {
        super(platformOpts, log);
        this.adbHelper = new AdbHelper(platformOpts.projectRoot);
        this.targetManager = new AndroidTargetManager(this.adbHelper);
    }

    public getPlatformOpts(): IAndroidPlatformOptions {
        return this.platformOpts;
    }

    public async launchApp(): Promise<IAndroidLaunchResult> {
        const command =
            this.platformOpts.cordovaExecutable ||
            CordovaProjectHelper.getCliCommand(this.projectRoot);

        if (this.runArguments.includes("--livereload")) {
            await this.IonicDevServer.startIonicDevServer(this.runArguments, this.platformOpts.env);
            return { devServerPort: this.IonicDevServer.getDevServerPort() };
        }

        const output = await cordovaRunCommand(
            command,
            this.runArguments,
            this.platformOpts.env,
            this.projectRoot,
            this.log,
        );

        const runOutput = output[0];
        const stderr = output[1];

        // Ionic ends process with zero code, so we need to look for
        // strings with error content to detect failed process
        const errorMatch = /(ERROR.*)/.test(runOutput) || /error:.*/i.test(stderr);
        if (errorMatch) {
            const error = ErrorHelper.getInternalError(InternalErrorCode.ErrorRunningAndroid);
            TelemetryHelper.sendErrorEvent("ErrorRunningAndroid", error);
            throw error;
        }
        return {};
    }

    public async prepareForAttach(): Promise<IAndroidAttachResult> {
        const appPackageName = await this.getAppPackageName();
        const target = await this.getPreferredTarget();

        const findAbstractNameFunction = () => {
            return this.adbHelper.getDevToolsAbstractName(target.id, appPackageName);
        };

        const abstractName = await retryAsync(
            findAbstractNameFunction,
            match => !!match,
            5,
            1,
            5000,
            ErrorHelper.getInternalError(InternalErrorCode.UnableToFindLocalAbstractName).message,
            this.platformOpts.cancellationTokenSource.token,
        );

        // Configure port forwarding to the app
        this.log(localize("ForwardingDebugPort", "Forwarding debug port"));
        await this.adbHelper.forwardTcpPortForDevToolsAbstractName(
            target.id,
            this.platformOpts.port.toString(),
            abstractName,
        );
        return {};
    }

    public async stopAndCleanUp(): Promise<void> {
        await super.stopAndCleanUp();
        // Stop ADB port forwarding if necessary
        if (this.target) {
            await this.adbHelper.removeForwardTcpPort(
                this.target.id,
                this.platformOpts.port.toString(),
            );
        }
    }

    public getRunArguments(): string[] {
        const args = ["run", "android"];

        if (this.platformOpts.runArguments && this.platformOpts.runArguments.length > 0) {
            args.push(...this.platformOpts.runArguments);
        } else {
            if (this.platformOpts.target) {
                args.push(
                    AdbHelper.isVirtualTarget(this.platformOpts.target) ? "--emulator" : "--device",
                );
                args.push(`--target=${this.platformOpts.target}`);
            }

            // Verify if we are using Ionic livereload
            if (this.platformOpts.ionicLiveReload) {
                if (this.platformOpts.projectType.isIonic) {
                    // Livereload is enabled, let Ionic do the launch
                    args.push("--livereload");
                } else {
                    this.log(IonicDevServer.NO_LIVERELOAD_WARNING);
                }
            }
        }

        return args;
    }

    public async getTargetFromRunArgs(): Promise<AndroidTarget | undefined> {
        if (this.platformOpts.runArguments && this.platformOpts.runArguments.length) {
            const targetId = AbstractPlatform.getOptFromRunArgs(
                this.platformOpts.runArguments,
                "--target",
            ) as string;
            if (targetId) {
                return new AndroidTarget({
                    isOnline: true,
                    isVirtualTarget: AdbHelper.isVirtualTarget(targetId),
                    id: targetId,
                });
            }
        }
        return undefined;
    }

    protected async getFirstAvailableOnlineTarget(): Promise<AndroidTarget> {
        return new AndroidTarget(await this.getFirstDebuggableTarget());
    }

    private async getAppPackageName(): Promise<string> {
        let manifestContents: Buffer;

        try {
            manifestContents = await fs.promises.readFile(
                path.join(this.projectRoot, AndroidPlatform.ANDROID_MANIFEST_PATH),
            );
        } catch (error) {
            if (error && error.code === "ENOENT") {
                manifestContents = await fs.promises.readFile(
                    path.join(this.projectRoot, AndroidPlatform.ANDROID_MANIFEST_PATH_8),
                );
            } else {
                throw error;
            }
        }

        const parsedFile = elementtree.XML(manifestContents.toString());
        const packageKey = "package";
        if (parsedFile.attrib[packageKey]) {
            return parsedFile.attrib[packageKey];
        }
        // Package key is removed from AndroidManifest.xml from cordova-android@12.0.0+
        let cordovaConfigContents: Buffer;
        try {
            cordovaConfigContents = await fs.promises.readFile(
                path.join(this.projectRoot, "config.xml"),
            );
        } catch (error) {
            throw error;
        }
        const parsedConfigFile = elementtree.XML(cordovaConfigContents.toString());
        const packageIdKey = "id";
        if (parsedConfigFile.attrib[packageIdKey]) {
            return parsedConfigFile.attrib[packageIdKey];
        }
        throw localize(
            "NoPackageNameFound",
            "Cannot find project package name from AndroidManifest.xml and config.xml",
        );
    }
}
