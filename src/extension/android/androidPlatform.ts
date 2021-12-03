// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { AdbHelper } from "../../utils/android/adb";
import { IAndroidPlatformOptions } from "../platformOptions";
import AbstractMobilePlatform from "../abstractMobilePlatform";
import { CordovaProjectHelper } from "../../utils/cordovaProjectHelper";
import { cordovaRunCommand } from "../../debugger/extension";
import { DebugConsoleLogger, TargetType } from "../../debugger/cordovaDebugSession1";
import * as nls from "vscode-nls";
import { AndroidTarget, AndroidTargetManager } from "../../utils/android/androidTargetManager";
import { retryAsync } from "../../utils/extensionHelper";
import * as fs from "fs";
import * as path from "path";
import * as elementtree from "elementtree";
import AbstractPlatform from "../abstractPlatform";
import IonicDevServerHelper from "../../utils/ionicDevServerHelper";
import { IAndroidAttachOptions } from "../platformAttachOptions";
nls.config({ messageFormat: nls.MessageFormat.bundle, bundleFormat: nls.BundleFormat.standalone })();
const localize = nls.loadMessageBundle();

export default class AndroidPlatform extends AbstractMobilePlatform {

    private static readonly ANDROID_MANIFEST_PATH = path.join("platforms", "android", "AndroidManifest.xml");
    private static readonly ANDROID_MANIFEST_PATH_8 = path.join("platforms", "android", "app", "src", "main", "AndroidManifest.xml");

    private adbHelper: AdbHelper;
    protected targetManager: AndroidTargetManager;

    constructor(
        protected platformOpts: IAndroidPlatformOptions,
        protected log: DebugConsoleLogger
    ) {
        super(platformOpts, log);
        this.adbHelper = new AdbHelper(platformOpts.projectRoot);
        this.targetManager = new AndroidTargetManager(this.adbHelper);
    }

    public getPlatformOpts(): IAndroidPlatformOptions {
        return this.platformOpts;
    }

    public async getTarget(): Promise<AndroidTarget> {
        if (!this.target) {
            const target = this.getTargetFromRunArgs();
            if (target) {
                this.target = target;
            } else {
                const onlineTargets = await this.adbHelper.getOnlineTargets();
                const onlineTargetsBySpecifiedType = onlineTargets.filter(target => {
                    switch (this.platformOpts.target) {
                        case TargetType.Emulator:
                            return target.isVirtualTarget;
                        case TargetType.Device:
                            return !target.isVirtualTarget;
                        case undefined:
                        case "":
                            return true;
                        default:
                            return target.id === this.platformOpts.target;
                    }
                });
                if (onlineTargetsBySpecifiedType.length) {
                    this.target = AndroidTarget.fromInterface(onlineTargetsBySpecifiedType[0]);
                } else if (onlineTargets.length) {
                    this.log(
                        localize(
                            "ThereIsNoOnlineTargetWithSpecifiedTargetType",
                            "There is no any online target with specified target type '{0}'. Continue with any online target.",
                            this.platformOpts.target,
                        ),
                    );
                    this.target = AndroidTarget.fromInterface(onlineTargets[0]);
                } else {
                    throw Error(localize(
                        "AndroidThereIsNoAnyOnlineDebuggableTarget",
                        "There is no any Android debuggable online target",
                    ));
                }
            }
        }
        return this.target;
    }

    public async launchApp(): Promise<void> {
        const command = this.platformOpts.cordovaExecutable || CordovaProjectHelper.getCliCommand(this.projectRoot);

        if (this.runArguments.includes("--livereload")) {
            await this.ionicDevServerHelper.startIonicDevServer(this.runArguments, this.platformOpts.env);
            return;
        }

        const output = await cordovaRunCommand(
            command,
            this.runArguments,
            this.platformOpts.env,
            this.projectRoot,
            this.log,
        );

        let runOutput = output[0];
        let stderr = output[1];

        // Ionic ends process with zero code, so we need to look for
        // strings with error content to detect failed process
        let errorMatch = /(ERROR.*)/.test(runOutput) || /error:.*/i.test(stderr);
        if (errorMatch) {
            throw new Error(localize("ErrorRunningAndroid", "Error running android"));
        }
    }

    public async prepareForAttach(): Promise<IAndroidAttachOptions> {
        const appPackageName = await this.getAppPackageName();
        const target = await this.getTarget();

        const findAbstractNameFunction = () => {
            return this.adbHelper.getDevToolsAbstractName(target.id, appPackageName);
        };

        const abstractName = await retryAsync(
            findAbstractNameFunction,
            (match) => !!match,
            5,
            1,
            5000,
            localize("UnableToFindLocalAbstractName", "Unable to find 'localabstract' name of Cordova app"),
            this.platformOpts.cancellationTokenSource.token
        );

        // Configure port forwarding to the app
        this.log(localize("ForwardingDebugPort", "Forwarding debug port"));
        await this.adbHelper.forwardTcpPortForDevToolsAbstractName(target.id, this.platformOpts.port.toString(), abstractName);
        return {};
    }

    public async stopAndCleanUp(): Promise<void> {
        // Stop ADB port forwarding if necessary
        if (this.target) {
            await this.adbHelper.removeforwardTcpPort(this.target.id, this.platformOpts.port.toString());
        }
        await this.ionicDevServerHelper.stopAndCleanUp();
    }

    public getRunArguments(): string[] {
        let args = ["run", "android"];

        if (this.platformOpts.runArguments && this.platformOpts.runArguments.length > 0) {
            args.push(...this.platformOpts.runArguments);
        } else {
            if (this.platformOpts.target) {
                args.push(AdbHelper.isVirtualTarget(this.platformOpts.target) ? "--emulator" : "--device");
                args.push(`--target=${this.platformOpts.target}`);
            }

            // Verify if we are using Ionic livereload
            if (this.platformOpts.ionicLiveReload) {
                if (CordovaProjectHelper.isIonicAngularProjectByProjectType(this.platformOpts.projectType)) {
                    // Livereload is enabled, let Ionic do the launch
                    args.push("--livereload");
                } else {
                    this.log(IonicDevServerHelper.NO_LIVERELOAD_WARNING);
                }
            }
        }

        return args;
    }

    public getTargetFromRunArgs(): AndroidTarget | undefined {
        if (this.platformOpts.runArguments && this.platformOpts.runArguments.length) {
            const deviceId = AbstractPlatform.getOptFromRunArgs(
                this.platformOpts.runArguments,
                "--target",
            ) as string;
            if (deviceId) {
                return new AndroidTarget(true, AdbHelper.isVirtualTarget(deviceId), deviceId);
            }
        }
        return undefined;
    }

    private async getAppPackageName(): Promise<string> {
        let manifestContents: Buffer;
        try {
            manifestContents = await fs.promises.readFile(path.join(this.projectRoot, AndroidPlatform.ANDROID_MANIFEST_PATH));
        } catch (error) {
            if (error && error.code === "ENOENT") {
                manifestContents = await fs.promises.readFile(path.join(this.projectRoot, AndroidPlatform.ANDROID_MANIFEST_PATH_8));
            } else {
                throw error;
            }
        }

        let parsedFile = elementtree.XML(manifestContents.toString());
        let packageKey = "package";
        return parsedFile.attrib[packageKey];
    }
}
