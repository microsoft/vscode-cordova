// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as nls from "vscode-nls";
import { OutputChannelLogger } from "../log/outputChannelLogger";
import { ChildProcess, ISpawnResult } from "../../common/node/childProcess";
import { IDebuggableMobileTarget } from "../MobileTarget";
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

const AndroidSDKEmulatorPattern = /^emulator-\d{1,5}$/;

export class AdbHelper {
    private childProcess: ChildProcess = new ChildProcess();
    private adbExecutable: string = "";

    constructor(projectRoot: string, logger?: OutputChannelLogger) {
        this.adbExecutable = this.getAdbPath(projectRoot, logger);
    }

    /**
     * Gets the list of Android connected devices and emulators.
     */
    public getConnectedDevices(): Promise<IDebuggableMobileTarget[]> {
        return this.childProcess.execToString(`${this.adbExecutable} devices`).then(output => {
            return this.parseConnectedDevices(output);
        });
    }

    public apiVersion(deviceId: string): Promise<AndroidAPILevel> {
        return this.executeQuery(deviceId, "shell getprop ro.build.version.sdk").then(output =>
            parseInt(output, 10),
        );
    }

    public reverseAdb(deviceId: string, packagerPort: number): Promise<string> {
        return this.execute(deviceId, `reverse tcp:${packagerPort} tcp:${packagerPort}`);
    }

    public getOnlineDevices(): Promise<IDebuggableMobileTarget[]> {
        return this.getConnectedDevices().then(devices => {
            return devices.filter(device => device.isOnline);
        });
    }

    public async getAvdNameById(emulatorId: string): Promise<string | null> {
        return this.childProcess.execToString(`${this.adbExecutable} -s ${emulatorId} emu avd name`)
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
        .catch(() => null);
    }

    public async getAvdsNames(): Promise<string[]> {
        const res = await this.childProcess.execToString(
            "emulator -list-avds",
        );
        let emulatorsNames: string[] = [];
        if (res) {
            emulatorsNames = res.split(/\r?\n|\r/g);
            const indexOfBlank = emulatorsNames.indexOf("");
            if (emulatorsNames.indexOf("") >= 0) {
                emulatorsNames.splice(indexOfBlank, 1);
            }
        }
        return emulatorsNames;
    }

    public async findOnlineDeviceById(deviceId: string): Promise<IDebuggableMobileTarget> {
        return (await this.getOnlineDevices()).find((device) => device.id === deviceId);
    }

    public startLogCat(adbParameters: string[]): ISpawnResult {
        return this.childProcess.spawn(this.adbExecutable.replace(/\"/g, ""), adbParameters);
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
        // Trying to read sdk location from local.properties file and if we succueded then
        // we would run adb from inside it, otherwise we would rely to PATH
        const sdkLocation = this.getSdkLocationFromLocalPropertiesFile(projectRoot, logger);
        return sdkLocation ? `"${path.join(sdkLocation, "platform-tools", "adb")}"` : "adb";
    }

    private parseConnectedDevices(input: string): IDebuggableMobileTarget[] {
        let result: IDebuggableMobileTarget[] = [];
        let regex = new RegExp("^(\\S+)\\t(\\S+)$", "mg");
        let match = regex.exec(input);
        while (match != null) {
            result.push({
                id: match[1],
                isOnline: match[2] === "device",
                isVirtualTarget: this.extractIsVirtualTarget(match[1]),
            });
            match = regex.exec(input);
        }
        return result;
    }

    private extractIsVirtualTarget(id: string): boolean {
        return id.match(AndroidSDKEmulatorPattern)
            ? true
            : false;
    }

    private executeQuery(deviceId: string, command: string): Promise<string> {
        return this.childProcess.execToString(this.generateCommandForDevice(deviceId, command));
    }

    private execute(deviceId: string, command: string): Promise<string> {
        return this.childProcess.execToString(this.generateCommandForDevice(deviceId, command));
    }

    private generateCommandForDevice(deviceId: string, adbCommand: string): string {
        return `${this.adbExecutable} -s "${deviceId}" ${adbCommand}`;
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
                logger.log(`${localize("CouldNotReadFrom", "Couldn't read from {0}.", localPropertiesFilePath)}\n${e}\n${e.stack}`);
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
