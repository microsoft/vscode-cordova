// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as nls from "vscode-nls";
import { OutputChannelLogger } from "../log/outputChannelLogger";
import { ChildProcess, ISpawnResult } from "../../common/node/childProcess";
import { IDebuggableMobileTarget } from "../mobileTarget";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

// See android versions usage at: http://developer.android.com/about/dashboards/index.html
export enum AndroidAPILevel {
    Marshmallow = 23,
    LOLLIPOP_MR1 = 22,
    LOLLIPOP = 21 /* Supports adb reverse */,
    KITKAT = 19,
    JELLY_BEAN_MR2 = 18,
    JELLY_BEAN_MR1 = 17,
    JELLY_BEAN = 16,
    ICE_CREAM_SANDWICH_MR1 = 15,
    GINGERBREAD_MR1 = 10,
}

export class AdbHelper {
    private static readonly PIDOFF_NOT_FOUND_ERROR = localize(
        "pidofNotFound",
        "/system/bin/sh: pidof: not found",
    );
    private static readonly PS_FIELDS_SPLITTER_RE = /\s+(?:[RSIDZTW<NL]\s+)?/;
    public static readonly AndroidSDKEmulatorPattern = /^emulator-\d{1,5}$/;

    private childProcess: ChildProcess = new ChildProcess();
    private adbExecutable: string = "";

    constructor(projectRoot: string, logger?: OutputChannelLogger) {
        this.adbExecutable = this.getAdbPath(projectRoot, logger);
    }

    public async forwardTcpPortForDevToolsAbstractName(
        targetId: string,
        tcpPort: string,
        devToolsAbstractName: string,
    ): Promise<void> {
        await this.execute(
            targetId,
            `forward tcp:${tcpPort} localabstract:${devToolsAbstractName}`,
        );
    }

    public async removeForwardTcpPort(targetId: string, tcpPort: string): Promise<void> {
        await this.execute(targetId, `forward --remove tcp:${tcpPort}`);
    }

    public async getPidForPackageName(targetId: string, appPackageName: string): Promise<string> {
        try {
            const pid = await this.execute(targetId, `shell pidof ${appPackageName}`);
            if (pid && /^[0-9]+$/.test(pid.trim())) {
                return pid.trim();
            }
            throw Error(AdbHelper.PIDOFF_NOT_FOUND_ERROR);
        } catch (error) {
            if (error.message !== AdbHelper.PIDOFF_NOT_FOUND_ERROR) {
                throw error;
            }

            const psResult = await this.execute(targetId, "shell ps");
            const lines = psResult.split("\n");
            const keys = lines.shift().split(AdbHelper.PS_FIELDS_SPLITTER_RE);
            const nameIdx = keys.indexOf("NAME");
            const pidIdx = keys.indexOf("PID");
            for (const line of lines) {
                const fields = line
                    .trim()
                    .split(AdbHelper.PS_FIELDS_SPLITTER_RE)
                    .filter(field => !!field);
                if (fields.length < nameIdx) {
                    continue;
                }
                if (fields[nameIdx] === appPackageName) {
                    return fields[pidIdx];
                }
            }
        }
    }

    public async getDevToolsAbstractName(
        targetId: string,
        appPackageName: string,
    ): Promise<string> {
        const pid = await this.getPidForPackageName(targetId, appPackageName);
        const getSocketsResult = await this.execute(targetId, "shell cat /proc/net/unix");
        const lines = getSocketsResult.split("\n");
        const keys = lines.shift().split(/[\s\r]+/);
        const flagsIdx = keys.indexOf("Flags");
        const stIdx = keys.indexOf("St");
        const pathIdx = keys.indexOf("Path");
        for (const line of lines) {
            const fields = line.split(/[\s\r]+/);
            if (fields.length < 8) {
                continue;
            }
            // flag = 00010000 (16) -> accepting connection
            // state = 01 (1) -> unconnected
            if (fields[flagsIdx] !== "00010000" || fields[stIdx] !== "01") {
                continue;
            }
            const pathField = fields[pathIdx];
            if (pathField.length < 1 || pathField[0] !== "@") {
                continue;
            }
            if (pathField.indexOf("_devtools_remote") === -1) {
                continue;
            }

            if (pathField === `@webview_devtools_remote_${pid}`) {
                // Matches the plain cordova webview format
                return pathField.substr(1);
            }

            if (pathField === `@${appPackageName}_devtools_remote`) {
                // Matches the crosswalk format of "@PACKAGENAME_devtools_remote
                return pathField.substr(1);
            }
            // No match, keep searching
        }
    }

    /**
     * Gets the list of Android connected devices and emulators.
     */
    public getConnectedTargets(): Promise<IDebuggableMobileTarget[]> {
        return this.childProcess.execToString(`${this.adbExecutable} devices`).then(output => {
            return this.parseConnectedTargets(output);
        });
    }

    public apiVersion(targetId: string): Promise<AndroidAPILevel> {
        return this.executeQuery(targetId, "shell getprop ro.build.version.sdk").then(output =>
            parseInt(output, 10),
        );
    }

    public reverseAdb(targetId: string, packagerPort: number): Promise<string> {
        return this.execute(targetId, `reverse tcp:${packagerPort} tcp:${packagerPort}`);
    }

    public getOnlineTargets(): Promise<IDebuggableMobileTarget[]> {
        return this.getConnectedTargets().then(targets => {
            return targets.filter(target => target.isOnline);
        });
    }

    public async getAvdNameById(emulatorId: string): Promise<string | null> {
        return (
            this.childProcess
                .execToString(`${this.adbExecutable} -s ${emulatorId} emu avd name`)
                // The command returns the name of avd by id of this running emulator.
                // Return value example:
                // "
                // emuName
                // OK
                // "
                .then(output => {
                    if (output) {
                        // Return the name of avd: emuName
                        return output.split(/\r?\n|\r/g)[0];
                    } else {
                        return null;
                    }
                })
                // If the command returned an error, it means that we could not find the emulator with the passed id
                .catch(() => null)
        );
    }

    public async getAvdsNames(): Promise<string[]> {
        const res = await this.childProcess.execToString("emulator -list-avds");
        let emulatorsNames: string[] = [];
        if (res) {
            emulatorsNames = res.split(/\r?\n|\r/g);
            const indexOfBlank = emulatorsNames.indexOf("");
            if (emulatorsNames.includes("")) {
                emulatorsNames.splice(indexOfBlank, 1);
            }
        }
        return emulatorsNames;
    }

    public async findOnlineTargetById(
        targetId: string,
    ): Promise<IDebuggableMobileTarget | undefined> {
        return (await this.getOnlineTargets()).find(target => target.id === targetId);
    }

    public startLogCat(adbParameters: string[]): ISpawnResult {
        return this.childProcess.spawn(this.adbExecutable.replace(/"/g, ""), adbParameters);
    }

    public parseSdkLocation(fileContent: string, logger?: OutputChannelLogger): string | null {
        const matches = fileContent.match(/^sdk\.dir=(.+)$/m);
        if (!matches || !matches[1]) {
            if (logger) {
                logger.log(
                    localize(
                        "NoSdkDirFoundInLocalPropertiesFile",
                        "No sdk.dir value found in local.properties file. Using Android SDK location from PATH.",
                    ),
                );
            }
            return null;
        }

        let sdkLocation = matches[1].trim();
        if (os.platform() === "win32") {
            // For Windows we need to unescape files separators and drive letter separators
            sdkLocation = sdkLocation.replace(/\\\\/g, "\\").replace("\\:", ":");
        }
        if (logger) {
            logger.log(
                localize(
                    "UsindAndroidSDKLocationDefinedInLocalPropertiesFile",
                    "Using Android SDK location defined in android/local.properties file: {0}.",
                    sdkLocation,
                ),
            );
        }

        return sdkLocation;
    }

    public getAdbPath(projectRoot: string, logger?: OutputChannelLogger): string {
        // Trying to read sdk location from local.properties file and if we succeeded then
        // we would run adb from inside it, otherwise we would rely to PATH
        const sdkLocation = this.getSdkLocationFromLocalPropertiesFile(projectRoot, logger);
        return sdkLocation ? `"${path.join(sdkLocation, "platform-tools", "adb")}"` : "adb";
    }

    private parseConnectedTargets(input: string): IDebuggableMobileTarget[] {
        const result: IDebuggableMobileTarget[] = [];
        const regex = new RegExp("^(\\S+)\\t(\\S+)$", "mg");
        let match = regex.exec(input);
        while (match != null) {
            result.push({
                id: match[1],
                isOnline: match[2] === "device",
                isVirtualTarget: AdbHelper.isVirtualTarget(match[1]),
            });
            match = regex.exec(input);
        }
        return result;
    }

    public static isVirtualTarget(id: string): boolean {
        return !!id.match(AdbHelper.AndroidSDKEmulatorPattern);
    }

    private executeQuery(targetId: string, command: string): Promise<string> {
        return this.childProcess.execToString(this.generateCommandForTarget(targetId, command));
    }

    private execute(targetId: string, command: string): Promise<string> {
        return this.childProcess.execToString(this.generateCommandForTarget(targetId, command));
    }

    private generateCommandForTarget(targetId: string, adbCommand: string): string {
        return `${this.adbExecutable} -s "${targetId}" ${adbCommand}`;
    }

    private getSdkLocationFromLocalPropertiesFile(
        projectRoot: string,
        logger?: OutputChannelLogger,
    ): string | null {
        const localPropertiesFilePath = path.join(projectRoot, "android", "local.properties");
        if (!fs.existsSync(localPropertiesFilePath)) {
            if (logger) {
                logger.log(
                    localize(
                        "LocalPropertiesFileDoesNotExist",
                        "local.properties file doesn't exist. Using Android SDK location from PATH.",
                    ),
                );
            }
            return null;
        }

        let fileContent: string;
        try {
            fileContent = fs.readFileSync(localPropertiesFilePath).toString();
        } catch (e) {
            if (logger) {
                logger.log(
                    `${localize(
                        "CouldNotReadFrom",
                        "Couldn't read from {0}.",
                        localPropertiesFilePath,
                    )}\n${e}\n${e.stack}`,
                );
                logger.log(
                    localize(
                        "UsingAndroidSDKLocationFromPATH",
                        "Using Android SDK location from PATH.",
                    ),
                );
            }
            return null;
        }
        return this.parseSdkLocation(fileContent, logger);
    }
}
