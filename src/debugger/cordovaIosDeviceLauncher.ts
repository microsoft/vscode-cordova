// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

"use strict";

import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as pl from "plist";
import * as Q from "q";
import * as xcode from "xcode";

let promiseExec = Q.denodeify(child_process.exec);

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

    public static getBundleIdentifier(projectRoot: string): Q.Promise<string> {
        return Q.nfcall(fs.readdir, path.join(projectRoot, "platforms", "ios")).then((files: string[]) => {
            let xcodeprojfiles = files.filter((file: string) => /\.xcodeproj$/.test(file));
            if (xcodeprojfiles.length === 0) {
                throw new Error("Unable to find xcodeproj file");
            }
            let xcodeprojfile = xcodeprojfiles[0];
            let projectName = /^(.*)\.xcodeproj/.exec(xcodeprojfile)[1];
            let filepath = path.join(projectRoot, "platforms", "ios", projectName, projectName + "-Info.plist");
            let plist = pl.parse(fs.readFileSync(filepath, "utf8"));
            // Since Cordova 9, no plain value is used, so we need to take it from project.pbxproj
            if (plist.CFBundleIdentifier === "$(PRODUCT_BUNDLE_IDENTIFIER)") {
                return this.getBundleIdentifierFromPbxproj(path.join(projectRoot, "platforms", "ios", xcodeprojfile));
            } else {
                return plist.CFBundleIdentifier;
            }
        });
    }

    public static startDebugProxy(proxyPort: number): Q.Promise<child_process.ChildProcess> {
        if (CordovaIosDeviceLauncher.nativeDebuggerProxyInstance) {
            CordovaIosDeviceLauncher.nativeDebuggerProxyInstance.kill("SIGHUP"); // idevicedebugserver does not exit from SIGTERM
            CordovaIosDeviceLauncher.nativeDebuggerProxyInstance = null;
        }

        return CordovaIosDeviceLauncher.mountDeveloperImage().then(function (): Q.Promise<child_process.ChildProcess> {
            let deferred = Q.defer<child_process.ChildProcess>();
            CordovaIosDeviceLauncher.nativeDebuggerProxyInstance = child_process.spawn("idevicedebugserverproxy", [proxyPort.toString()]);
            CordovaIosDeviceLauncher.nativeDebuggerProxyInstance.on("error", function (err: any): void {
                deferred.reject(err);
            });
            // Allow 200ms for the spawn to error out, ~125ms isn't uncommon for some failures
            Q.delay(200).then(() => deferred.resolve(CordovaIosDeviceLauncher.nativeDebuggerProxyInstance));

            return deferred.promise;
        });
    }

    public static startWebkitDebugProxy(proxyPort: number, proxyRangeStart: number, proxyRangeEnd: number): Q.Promise<any> {
        if (CordovaIosDeviceLauncher.webDebuggerProxyInstance) {
            CordovaIosDeviceLauncher.webDebuggerProxyInstance.kill();
            CordovaIosDeviceLauncher.webDebuggerProxyInstance = null;
        }

        let deferred = Q.defer();
        let portRange = `null:${proxyPort},:${proxyRangeStart}-${proxyRangeEnd}`;
        CordovaIosDeviceLauncher.webDebuggerProxyInstance = child_process.spawn("ios_webkit_debug_proxy", ["-c", portRange]);
        CordovaIosDeviceLauncher.webDebuggerProxyInstance.on("error", function () {
            deferred.reject(new Error("Unable to start ios_webkit_debug_proxy."));
        });
        // Allow some time for the spawned process to error out
        Q.delay(250).then(() => deferred.resolve({}));

        return deferred.promise;
    }

    public static getPathOnDevice(packageId: string): Q.Promise<string> {
        return promiseExec("ideviceinstaller -l -o xml > /tmp/$$.ideviceinstaller && echo /tmp/$$.ideviceinstaller")
        .catch(function (err: any): any {
            if (err.code === "ENOENT") {
                throw new Error("Unable to find ideviceinstaller.");
            }
            throw err;
        }).spread<string>(function (stdout: string): string {
            // First find the path of the app on the device
            let filename: string = stdout.trim();
            if (!/^\/tmp\/[0-9]+\.ideviceinstaller$/.test(filename)) {
                throw new Error("Unable to list installed applications on device");
            }

            let list: any[] = pl.parse(fs.readFileSync(filename, "utf8"));
            fs.unlinkSync(filename);
            for (let i: number = 0; i < list.length; ++i) {
                if (list[i].CFBundleIdentifier === packageId) {
                    let path: string = list[i].Path;
                    return path;
                }
            }

            throw new Error("Application not installed on the device");
        });
    }

    public static encodePath(packagePath: string): string {
        // Encode the path by converting each character value to hex
        return packagePath.split("").map((c: string) => c.charCodeAt(0).toString(16)).join("").toUpperCase();
    }

    private static getBundleIdentifierFromPbxproj(xcodeprojFilePath: string): Q.Promise<string> {
        const pbxprojFilePath = path.join(xcodeprojFilePath, "project.pbxproj");
        const pbxproj = xcode.project(pbxprojFilePath).parseSync();
        const target = pbxproj.getFirstTarget();
        const configListUUID = target.firstTarget.buildConfigurationList;
        const configListsMap = pbxproj.pbxXCConfigurationList();
        const targetConfigs = configListsMap[configListUUID].buildConfigurations;
        const targetConfigUUID = targetConfigs[0].value; // 0 is "Debug, 1 is Release" - usually they have the same associated bundleId, it's highly unlikely someone would change it
        const allConfigs = pbxproj.pbxXCBuildConfigurationSection();
        const bundleId = allConfigs[targetConfigUUID].buildSettings.PRODUCT_BUNDLE_IDENTIFIER;
        return Q.resolve(bundleId);
    }
    private static mountDeveloperImage(): Q.Promise<any> {
        return CordovaIosDeviceLauncher.getDiskImage()
            .then(function (path: string): Q.Promise<any> {
            let imagemounter: child_process.ChildProcess = child_process.spawn("ideviceimagemounter", [path, path + ".signature"]);
            let deferred: Q.Deferred<any> = Q.defer();
            let stdout: string = "";
            imagemounter.stdout.on("data", function (data: any): void {
                stdout += data.toString();
            });
            imagemounter.on("close", function (code: number): void {
                if (code !== 0) {
                    if (stdout.indexOf("Error:") !== -1) {
                        deferred.resolve({}); // Technically failed, but likely caused by the image already being mounted.
                    } else if (stdout.indexOf("No device found, is it plugged in?") !== -1) {
                        deferred.reject("Unable to find device. Is the device plugged in?");
                    }

                    deferred.reject("Unable to mount developer disk image.");
                } else {
                    deferred.resolve({});
                }
            });
            imagemounter.on("error", function(err: any): void {
                deferred.reject(err);
            });
            return deferred.promise;
        });
    }

    private static getDiskImage(): Q.Promise<string> {
        // Attempt to find the OS version of the iDevice, e.g. 7.1
        let versionInfo: Q.Promise<any> = promiseExec("ideviceinfo -s -k ProductVersion")
            .spread<string>(function (stdout: string): string {
                // Versions for DeveloperDiskImage seem to be X.Y, while some device versions are X.Y.Z
                return /^(\d+\.\d+)(?:\.\d+)?$/gm.exec(stdout.trim())[1];
            })
            .catch(function (e): string {
                throw new Error(`Unable to get device OS version. Details: ${e.message}`);
            });

        // Attempt to find the path where developer resources exist.
        let pathInfo: Q.Promise<any> = promiseExec("xcrun -sdk iphoneos --show-sdk-platform-path").spread<string>(function (stdout: string): string {
            let sdkpath: string = stdout.trim();
            return sdkpath;
        });

        // Attempt to find the developer disk image for the appropriate
        return Q.all([versionInfo, pathInfo]).spread<string>(function (version: string, sdkpath: string): Q.Promise<string> {
            let find: child_process.ChildProcess = child_process.spawn("find", [sdkpath, "-path", "*" + version + "*", "-name", "DeveloperDiskImage.dmg"]);
            let deferred: Q.Deferred<string> = Q.defer<string>();

            find.stdout.on("data", function (data: any): void {
                let dataStr: string = data.toString();
                let path: string = dataStr.split("\n")[0].trim();
                if (!path) {
                    deferred.reject("Unable to find developer disk image");
                } else {
                    deferred.resolve(path);
                }
            });
            find.on("close", function (): void {
                deferred.reject("Unable to find developer disk image");
            });

            return deferred.promise;
        });
    }
}

process.on("exit", CordovaIosDeviceLauncher.cleanup);
