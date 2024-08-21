// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

"use strict";

import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as pl from "plist";
import * as nls from "vscode-nls";
import { delay } from "../utils/extensionHelper";
import { ChildProcess } from "../common/node/childProcess";
import { IOSTarget } from "../utils/ios/iOSTargetManager";
import { isDirectory } from "../common/utils";
import { PlistBuddy } from "../utils/ios/PlistBuddy";
import { InternalErrorCode } from "../common/error/internalErrorCode";
import { ErrorHelper } from "../common/error/errorHelper";
import { XCParseConfiguration } from "../common/xcparseConfiguration";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export class CordovaIosDeviceLauncher {
    private static nativeDebuggerProxyInstance: child_process.ChildProcess;
    private static webDebuggerProxyInstance: child_process.ChildProcess;

    public static cleanup(): void {
        if (CordovaIosDeviceLauncher.nativeDebuggerProxyInstance) {
            CordovaIosDeviceLauncher.nativeDebuggerProxyInstance.kill("SIGHUP");
            CordovaIosDeviceLauncher.nativeDebuggerProxyInstance = null;
        }
        if (CordovaIosDeviceLauncher.webDebuggerProxyInstance) {
            CordovaIosDeviceLauncher.webDebuggerProxyInstance.kill();
            CordovaIosDeviceLauncher.webDebuggerProxyInstance = null;
        }
    }

    public static getBundleIdentifier(projectRoot: string): Promise<string> {
        return fs.promises
            .readdir(path.join(projectRoot, "platforms", "ios"))
            .then((files: string[]) => {
                const xcodeprojfiles = files.filter((file: string) => /\.xcodeproj$/.test(file));
                if (xcodeprojfiles.length === 0) {
                    throw ErrorHelper.getInternalError(InternalErrorCode.UnableToFindXCodeProjFile);
                }
                const xcodeprojfile = xcodeprojfiles[0];
                const projectName = /^(.*)\.xcodeproj/.exec(xcodeprojfile)[1];
                const filepath = path.join(
                    projectRoot,
                    "platforms",
                    "ios",
                    projectName,
                    `${projectName}-Info.plist`,
                );
                const plist = pl.parse(fs.readFileSync(filepath, "utf8"));
                // Since Cordova 9, no plain value is used, so we need to take it from project.pbxproj
                if (plist.CFBundleIdentifier === "$(PRODUCT_BUNDLE_IDENTIFIER)") {
                    return this.getBundleIdentifierFromPbxproj(
                        path.join(projectRoot, "platforms", "ios", xcodeprojfile),
                    );
                }
                return plist.CFBundleIdentifier;
            });
    }

    public static startDebugProxy(proxyPort: number): Promise<child_process.ChildProcess> {
        if (CordovaIosDeviceLauncher.nativeDebuggerProxyInstance) {
            CordovaIosDeviceLauncher.nativeDebuggerProxyInstance.kill("SIGHUP"); // idevicedebugserver does not exit from SIGTERM
            CordovaIosDeviceLauncher.nativeDebuggerProxyInstance = null;
        }

        return CordovaIosDeviceLauncher.mountDeveloperImage().then(() => {
            return new Promise((resolve, reject) => {
                CordovaIosDeviceLauncher.nativeDebuggerProxyInstance = child_process.spawn(
                    "idevicedebugserverproxy",
                    [proxyPort.toString()],
                    { shell: true },
                );
                CordovaIosDeviceLauncher.nativeDebuggerProxyInstance.on(
                    "error",
                    function (err: any): void {
                        reject(err);
                    },
                );
                // Allow 200ms for the spawn to error out, ~125ms isn't uncommon for some failures
                // eslint-disable-next-line
                return delay(200).then(() =>
                    resolve(CordovaIosDeviceLauncher.nativeDebuggerProxyInstance),
                );
            });
        });
    }

    public static startWebkitDebugProxy(
        proxyPort: number,
        proxyRangeStart: number,
        proxyRangeEnd: number,
        iOSTarget: IOSTarget,
    ): Promise<void> {
        if (CordovaIosDeviceLauncher.webDebuggerProxyInstance) {
            CordovaIosDeviceLauncher.webDebuggerProxyInstance.kill();
            CordovaIosDeviceLauncher.webDebuggerProxyInstance = null;
        }

        return new Promise(async (resolve, reject) => {
            const iwdpArgs = ["-c", `null:${proxyPort},:${proxyRangeStart}-${proxyRangeEnd}`];

            if (iOSTarget.isVirtualTarget) {
                const webInspectorSocketPath = await CordovaIosDeviceLauncher.getWebInspectorSocket(
                    iOSTarget.id,
                );
                if (!webInspectorSocketPath) {
                    throw ErrorHelper.getInternalError(
                        InternalErrorCode.CouldNotFindWebInspectorSocketOniOSSimulator,
                        iOSTarget.id,
                    );
                }

                iwdpArgs.push("-s", `unix:${webInspectorSocketPath}`);
            }

            CordovaIosDeviceLauncher.webDebuggerProxyInstance = child_process.spawn(
                "ios_webkit_debug_proxy",
                iwdpArgs,
                { shell: true },
            );
            CordovaIosDeviceLauncher.webDebuggerProxyInstance.on("error", function () {
                reject(
                    new Error(
                        localize(
                            "UnableToStartIosWebkitDebugProxy",
                            "Unable to start ios_webkit_debug_proxy.",
                        ),
                    ),
                );
            });
            // Allow some time for the spawned process to error out
            return delay(300).then(() => resolve(undefined)); // eslint-disable-line
        });
    }

    public static getPathOnDevice(packageId: string): Promise<string> {
        const cp = new ChildProcess();
        return cp
            .execToString(
                "ideviceinstaller -l -o xml > /tmp/$$.ideviceinstaller && echo /tmp/$$.ideviceinstaller",
            )
            .catch(function (err: any): any {
                if (err.code === "ENOENT") {
                    throw ErrorHelper.getInternalError(
                        InternalErrorCode.UnableToStartiDeviceInstaller,
                    );
                }
                throw err;
            })
            .then((stdout: string) => {
                // First find the path of the app on the device
                const filename: string = stdout.trim();
                if (!/^\/tmp\/\d+\.ideviceinstaller$/.test(filename)) {
                    throw ErrorHelper.getInternalError(
                        InternalErrorCode.UnableToListInstalledApplicationsOnDevice,
                    );
                }

                const list: any[] = pl.parse(fs.readFileSync(filename, "utf8"));
                fs.unlinkSync(filename);
                for (let i = 0; i < list.length; ++i) {
                    if (list[i].CFBundleIdentifier === packageId) {
                        const path: string = list[i].Path;
                        return path;
                    }
                }

                throw ErrorHelper.getInternalError(
                    InternalErrorCode.ApplicationNotInstalledOnTheDevice,
                );
            });
    }

    public static encodePath(packagePath: string): string {
        // Encode the path by converting each character value to hex
        return packagePath
            .split("")
            .map((c: string) => c.charCodeAt(0).toString(16))
            .join("")
            .toUpperCase();
    }

    public static async getPathOnSimulator(
        packageId: string,
        deviceDataPath: string,
    ): Promise<string> {
        const appsContainer = path.join(deviceDataPath, "Containers", "Bundle", "Application");
        if (!fs.existsSync(appsContainer)) {
            throw ErrorHelper.getInternalError(
                InternalErrorCode.ApplicationPathNotExistingOniOSSimulator,
                appsContainer,
            );
        }

        const plistBuddy = new PlistBuddy();

        const appFolders = (await fs.promises.readdir(appsContainer))
            .map(appId => path.join(appsContainer, appId))
            .filter(appDir => isDirectory(appDir));

        const appFiles: string[] = [];
        for (const appFolder of appFolders) {
            appFiles.push(
                ...(await fs.promises.readdir(appFolder))
                    .filter(file => file.endsWith(".app"))
                    .map(file => path.join(appFolder, file)),
            );
        }

        for (const appFile of appFiles) {
            try {
                const bundleIdentifie = await plistBuddy.readPlistProperty(
                    path.join(appFile, "Info.plist"),
                    ":CFBundleIdentifier",
                );
                if (bundleIdentifie === packageId) {
                    return appFile;
                }
            } catch {}
        }

        throw ErrorHelper.getInternalError(InternalErrorCode.ApplicationNotInstalledOnTheSimulator);
    }

    private static getBundleIdentifierFromPbxproj(xcodeprojFilePath: string): Promise<string> {
        const pbxprojFilePath = path.join(xcodeprojFilePath, "project.pbxproj");
        const pbxproj = XCParseConfiguration.getPbxprojFileContent(pbxprojFilePath);
        const firstTarget = XCParseConfiguration.getPBXNativeTarget(pbxproj);
        const configListUUID = firstTarget.buildConfigurationList;
        const targetConfigs = pbxproj.objects[configListUUID].buildConfigurations;
        const targetConfigUUID = targetConfigs[0]; // 0 is "Debug, 1 is Release" - usually they have the same associated bundleId, it's highly unlikely someone would change it
        const bundleId = pbxproj.objects[targetConfigUUID].buildSettings.PRODUCT_BUNDLE_IDENTIFIER;
        return Promise.resolve(bundleId);
    }

    private static async getWebInspectorSocket(simId: string): Promise<string | null> {
        const cp = new ChildProcess();
        // lsof -aUc launchd_sim
        // gives a set of records like:
        //   launchd_s 69760 isaac    3u  unix 0x57aa4fceea3937f3      0t0      /private/tmp/com.apple.CoreSimulator.SimDevice.D7082A5C-34B5-475C-994E-A21534423B9E/syslogsock
        //   launchd_s 69760 isaac    5u  unix 0x57aa4fceea395f03      0t0      /private/tmp/com.apple.launchd.2B2u8CkN8S/Listeners
        //   launchd_s 69760 isaac    6u  unix 0x57aa4fceea39372b      0t0      ->0x57aa4fceea3937f3
        //   launchd_s 69760 isaac    8u  unix 0x57aa4fceea39598b      0t0      /private/tmp/com.apple.launchd.2j5k1TMh6i/com.apple.webinspectord_sim.socket
        //   launchd_s 69760 isaac    9u  unix 0x57aa4fceea394c43      0t0      /private/tmp/com.apple.launchd.4zm9JO9KEs/com.apple.testmanagerd.unix-domain.socket
        //   launchd_s 69760 isaac   10u  unix 0x57aa4fceea395f03      0t0      /private/tmp/com.apple.launchd.2B2u8CkN8S/Listeners
        //   launchd_s 69760 isaac   11u  unix 0x57aa4fceea39598b      0t0      /private/tmp/com.apple.launchd.2j5k1TMh6i/com.apple.webinspectord_sim.socket
        //   launchd_s 69760 isaac   12u  unix 0x57aa4fceea394c43      0t0      /private/tmp/com.apple.launchd.4zm9JO9KEs/com.apple.testmanagerd.unix-domain.socket
        // these _appear_ to always be grouped together (so, the records for the particular sim are all in a group, before the next sim, etc.)
        // so starting from the correct UDID, we ought to be able to pull the next record with `com.apple.webinspectord_sim.socket` to get the correct socket
        const result = await cp.execToString("lsof -aUc launchd_sim");
        for (const record of result.split("com.apple.CoreSimulator.SimDevice.")) {
            if (!record.includes(simId)) {
                continue;
            }
            const webinspectorSocketRegexp = /\s+(\S+com\.apple\.webinspectord_sim\.socket)/;
            const match = webinspectorSocketRegexp.exec(record);
            if (!match) {
                return null;
            }
            return match[1]; // /private/tmp/com.apple.launchd.ZY99hRfFoa/com.apple.webinspectord_sim.socket
        }

        return null;
    }

    private static mountDeveloperImage(): Promise<void> {
        return CordovaIosDeviceLauncher.getDiskImage().then((path: string) => {
            const imagemounter: child_process.ChildProcess = child_process.spawn(
                "ideviceimagemounter",
                [path, `${path}.signature`],
                { shell: true },
            );
            return new Promise((resolve, reject) => {
                let stdout = "";
                imagemounter.stdout.on("data", function (data: any): void {
                    stdout += data.toString();
                });
                imagemounter.on("close", function (code: number): void {
                    if (code !== 0) {
                        if (stdout.includes("Error:")) {
                            resolve(); // Technically failed, but likely caused by the image already being mounted.
                        } else if (stdout.includes("No device found, is it plugged in?")) {
                            reject(
                                localize(
                                    "UnableToFindDevice",
                                    "Unable to find device. Is the device plugged in?",
                                ),
                            );
                        }

                        reject(
                            localize(
                                "UnableToMountDeveloperDiskImage",
                                "Unable to mount developer disk image.",
                            ),
                        );
                    } else {
                        resolve();
                    }
                });
                imagemounter.on("error", function (err: any): void {
                    reject(err);
                });
            });
        });
    }

    private static getDiskImage(): Promise<string> {
        const cp = new ChildProcess();
        // Attempt to find the OS version of the iDevice, e.g. 7.1
        const versionInfo: Promise<string> = cp
            .execToString("ideviceinfo -s -k ProductVersion")
            .then(stdout => {
                // Versions for DeveloperDiskImage seem to be X.Y, while some device versions are X.Y.Z
                return /^(\d+\.\d+)(?:\.\d+)?$/gm.exec(stdout.trim())[1];
            })
            .catch(err => {
                throw ErrorHelper.getInternalError(
                    InternalErrorCode.UnableToGetDeviceOSVersion,
                    err.message,
                );
            });

        // Attempt to find the path where developer resources exist.
        const pathInfo: Promise<string> = cp
            .execToString("xcrun -sdk iphoneos --show-sdk-platform-path")
            .then(stdout => {
                const sdkpath: string = stdout.trim();
                return sdkpath;
            });

        // Attempt to find the developer disk image for the appropriate
        return Promise.all([versionInfo, pathInfo]).then(([version, sdkpath]) => {
            const find: child_process.ChildProcess = child_process.spawn(
                "find",
                [sdkpath, "-path", `*${version}*`, "-name", "DeveloperDiskImage.dmg"],
                { shell: true },
            );
            return new Promise<string>((resolve, reject) => {
                find.stdout.on("data", function (data: any): void {
                    const dataStr: string = data.toString();
                    const path: string = dataStr.split("\n")[0].trim();
                    if (!path) {
                        reject(
                            localize(
                                "UnableToFindDeveloperDiskImage",
                                "Unable to find developer disk image.",
                            ),
                        );
                    } else {
                        resolve(path);
                    }
                });
                find.on("close", function (): void {
                    reject(
                        localize(
                            "UnableToFindDeveloperDiskImage",
                            "Unable to find developer disk image.",
                        ),
                    );
                });
            });
        });
    }
}
