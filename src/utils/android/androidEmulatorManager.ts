// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as nls from "vscode-nls";
import { QuickPickOptions, window } from "vscode";
import { IVirtualDevice, VirtualDeviceManager } from "../VirtualDeviceManager";
import { AdbHelper, DeviceType } from "./adb";
import { ChildProcess } from "../../common/node/childProcess";
import { TargetType } from "../../debugger/cordovaDebugSession";
import { OutputChannelLogger } from "../log/outputChannelLogger";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IAndroidEmulator extends IVirtualDevice { }

export class AndroidEmulatorManager extends VirtualDeviceManager {
    private static readonly EMULATOR_COMMAND = "emulator";
    private static readonly EMULATOR_LIST_AVDS_COMMAND = "-list-avds";
    private static readonly EMULATOR_AVD_START_COMMAND = "-avd";

    private static readonly EMULATOR_START_TIMEOUT = 120;

    private logger: OutputChannelLogger = OutputChannelLogger.getChannel(
        OutputChannelLogger.MAIN_CHANNEL_NAME,
        true,
    );

    private adbHelper: AdbHelper;
    private childProcess: ChildProcess;

    constructor(adbHelper: AdbHelper) {
        super();
        this.adbHelper = adbHelper;
        this.childProcess = new ChildProcess();
    }

    public async startEmulator(target: string): Promise<IAndroidEmulator | null> {
        if (target !== TargetType.Emulator) {
            const onlineDevices = await this.adbHelper.getOnlineDevices();
            for (let i = 0; i < onlineDevices.length; i++) {
                if (onlineDevices[i].type === DeviceType.AndroidSdkEmulator) {
                    if (onlineDevices[i].id === target) {
                        return { name: await this.adbHelper.getAvdNameById(target), id: target };
                    }
                    if (await this.adbHelper.getAvdNameById(onlineDevices[i].id) === target) {
                        return { name: target, id: onlineDevices[i].id };
                    }
                }
            }
            if ((await this.getVirtualDevicesNamesList()).includes(target)) {
                const emulatorId = await this.tryLaunchEmulatorByName(target);
                return { name: target, id: emulatorId };
            }
        } else {
            const newEmulator = await this.startSelection();
            if (newEmulator) {
                const emulatorId = await this.tryLaunchEmulatorByName(newEmulator);
                return { name: newEmulator, id: emulatorId };
            }
        }
        return null;
    }

    public async tryLaunchEmulatorByName(emulatorName: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const emulatorProcess = this.childProcess.spawn(
                AndroidEmulatorManager.EMULATOR_COMMAND,
                [AndroidEmulatorManager.EMULATOR_AVD_START_COMMAND, emulatorName],
                {
                    detached: true,
                },
                true,
            );
            emulatorProcess.outcome.catch(error => {
                if (
                    process.platform == "win32" &&
                    process.env.SESSIONNAME &&
                    process.env.SESSIONNAME.toLowerCase().includes("rdp-tcp")
                ) {
                    this.logger.log(
                        localize(
                            "RDPEmulatorWarning",
                            "Android emulator was launched from the Windows RDP session, this might lead to failures.",
                        ),
                    );
                }
                reject(new Error(`Virtual device launch finished with an exception: ${error}`));
            });
            emulatorProcess.spawnedProcess.unref();

            const rejectTimeout = setTimeout(() => {
                cleanup();
                reject(new Error(`Virtual device launch finished with an exception: ${localize(
                    "EmulatorStartWarning",
                    "Could not start the emulator {0} within {1} seconds.",
                    emulatorName,
                    AndroidEmulatorManager.EMULATOR_START_TIMEOUT,
                )}`));
            }, AndroidEmulatorManager.EMULATOR_START_TIMEOUT * 1000);

            const bootCheckInterval = setInterval(async () => {
                const connectedDevices = await this.adbHelper.getOnlineDevices();
                for (let i = 0; i < connectedDevices.length; i++) {
                    const onlineAvdName = await this.adbHelper.getAvdNameById(connectedDevices[i].id);
                    if (onlineAvdName === emulatorName) {
                        this.logger.log(
                            localize("EmulatorLaunched", "Launched emulator {0}", emulatorName),
                        );
                        cleanup();
                        resolve(connectedDevices[i].id);
                    }
                }
            }, 1000);

            const cleanup = () => {
                clearTimeout(rejectTimeout);
                clearInterval(bootCheckInterval);
            };
        });
    }

    public startSelection(): Promise<string | undefined> {
        return this.selectVirtualDevice();
    }

    public async selectOnlineDevice(target: string, deviceType?: DeviceType): Promise<IAndroidEmulator> {
        const onlineDevices = await this.adbHelper.getOnlineDevices();
        const emulatorsList: IAndroidEmulator[] = [];
        for (let device of onlineDevices) {
            if (deviceType === undefined || deviceType === device.type) {
                if (device.type === DeviceType.AndroidSdkEmulator) {
                    emulatorsList.push({ name: await this.adbHelper.getAvdNameById(device.id), id: device.id });
                }
                if (device.type === DeviceType.Other) {
                    emulatorsList.push({ name: device.id, id: device.id });
                }
            }
        }
        for (let emulator of emulatorsList) {
            if (emulator.id === target || emulator.name === target) {
                return emulator;
            }
        }
        const quickPickOptions: QuickPickOptions = {
            ignoreFocusOut: true,
            canPickMany: false,
            placeHolder: localize("SelectOnlineDevice", "Select online Android device"),
        };
        let result: string | undefined = emulatorsList[0]?.name;
        if (emulatorsList.length > 1) {
            result = await window.showQuickPick(emulatorsList.map(emulator => emulator.name), quickPickOptions);
        }
        return emulatorsList.find(emulator => emulator.name === result);
    }

    protected async getVirtualDevicesNamesList(): Promise<string[]> {
        const res = await this.childProcess.execToString(
            `${AndroidEmulatorManager.EMULATOR_COMMAND} ${AndroidEmulatorManager.EMULATOR_LIST_AVDS_COMMAND}`,
        );
        let emulatorsList: string[] = [];
        if (res) {
            emulatorsList = res.split(/\r?\n|\r/g);
            const indexOfBlank = emulatorsList.indexOf("");
            if (emulatorsList.indexOf("") >= 0) {
                emulatorsList.splice(indexOfBlank, 1);
            }
        }
        return emulatorsList;
    }

    public async isEmulatorTarget(target: string): Promise<boolean> {
        return target.toLowerCase().includes(TargetType.Emulator) || (await this.getVirtualDevicesNamesList()).includes(target);
    }
}
