// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as nls from "vscode-nls";
import { Target, TargetManager } from "../TargetManager";
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
export class AndroidTarget extends Target {
    get name(): string | undefined {
        if (!this._name) {
            return this._id;
        }
        return this._name;
    }
 }

export class AndroidEmulatorManager extends TargetManager {
    private static readonly EMULATOR_COMMAND = "emulator";
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

    public async startEmulator(target: string): Promise<AndroidTarget | null> {
        if (target !== TargetType.Emulator) {
            const targetList = await this.getTargetList(androidTarget => androidTarget.isVirtualTarget && (androidTarget.id === target || androidTarget.name === target));
            const emulatorTarget = targetList[0];
            if (emulatorTarget) {
                if (!emulatorTarget.isOnline) {
                    return await this.tryLaunchEmulator(emulatorTarget);
                } else {
                    return emulatorTarget;
                }
            }
        } else {
            const emulator = await this.startSelection(androidTarget => androidTarget.isVirtualTarget);
            if (emulator) {
                return await this.tryLaunchEmulator(emulator);
            }
        }
        return null;
    }

    public async tryLaunchEmulatorByName(emulatorName: string): Promise<AndroidTarget> {
        const emulatorTarget = new AndroidTarget(false, true, emulatorName);
        return this.tryLaunchEmulator(emulatorTarget);
    }

    public async tryLaunchEmulator(emulatorTarget: AndroidTarget): Promise<AndroidTarget> {
        return new Promise((resolve, reject) => {
            const emulatorProcess = this.childProcess.spawn(
                AndroidEmulatorManager.EMULATOR_COMMAND,
                [AndroidEmulatorManager.EMULATOR_AVD_START_COMMAND, emulatorTarget.name],
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
                    emulatorTarget.name,
                    AndroidEmulatorManager.EMULATOR_START_TIMEOUT,
                )}`));
            }, AndroidEmulatorManager.EMULATOR_START_TIMEOUT * 1000);

            const bootCheckInterval = setInterval(async () => {
                const connectedDevices = await this.adbHelper.getOnlineDevices();
                for (let i = 0; i < connectedDevices.length; i++) {
                    const onlineAvdName = await this.adbHelper.getAvdNameById(connectedDevices[i].id);
                    if (onlineAvdName === emulatorTarget.name) {
                        emulatorTarget.id = connectedDevices[i].id;
                        emulatorTarget.isOnline = true;
                        this.logger.log(
                            localize("EmulatorLaunched", "Launched emulator {0}", emulatorTarget.name),
                        );
                        cleanup();
                        resolve(emulatorTarget);
                        break;
                    }
                }
            }, 1000);

            const cleanup = () => {
                clearTimeout(rejectTimeout);
                clearInterval(bootCheckInterval);
            };
        });
    }

    public startSelection(filter?: (el: Target) => boolean): Promise<AndroidTarget | undefined> {
        return this.selectTarget(filter);
    }

    public async getTargetList(filter?: (el: AndroidTarget) => boolean): Promise<AndroidTarget[]>{
        const targetList: AndroidTarget[] = [];

        let emulatorsNames: string[] = await this.adbHelper.getAvdsNames();
        targetList.push(...emulatorsNames.map(name => new AndroidTarget(false, true, name)));

        const onlineTargets = await this.adbHelper.getOnlineDevices();
        for (let device of onlineTargets) {
            switch (device.type) {
                case DeviceType.AndroidSdkEmulator: {
                    const avdName = await this.adbHelper.getAvdNameById(device.id);
                    const emulatorTarget = targetList.find(target => target.name === avdName);
                    if (emulatorTarget) {
                      emulatorTarget.isOnline = true;
                      emulatorTarget.id = device.id;
                    }
                    break;
                }
                default : {
                    targetList.push(new AndroidTarget(true, false, undefined, device.id));
                }
            }
        }

        return filter ? targetList.filter(filter) : targetList;
    }
}
