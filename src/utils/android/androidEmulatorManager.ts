// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as nls from "vscode-nls";
import { MobileTargetManager } from "../MobileTargetManager";
import { AdbHelper } from "./adb";
import { ChildProcess } from "../../common/node/childProcess";
import { OutputChannelLogger } from "../log/outputChannelLogger";
import { IMobileTarget, MobileTarget } from "../MobileTarget";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export class AndroidTarget extends MobileTarget {

    public static fromInterface(obj: IMobileTarget): AndroidTarget{
        return new AndroidTarget(obj.isOnline, obj.isVirtualTarget, obj.id, obj.name);
    }

    constructor(isOnline: boolean, isVirtualTarget: boolean, id: string, name?: string) {
        super(isOnline, isVirtualTarget, id, name ? name : id);
    }
 }

export class AndroidEmulatorManager extends MobileTargetManager {
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

    public async isVirtualTarget(target: string): Promise<boolean> {
        try {
            if (target.includes("device")) {
                return false;
            } else if (target.includes("emulator") || (await this.adbHelper.getAvdsNames()).includes(target)) {
                return true;
            } else {
                const onlineTarget = await this.adbHelper.findOnlineDeviceById(target);
                return onlineTarget.isVirtualTarget;
            }
        } catch {
            throw new Error(localize("CouldNotRecognizeTargetType", "Could not recognize type for target {0}"));
        }
    }

    public async selectAndPrepareTarget(filter?: (el: IMobileTarget) => boolean): Promise<AndroidTarget | undefined> {
        const selectedTarget = await this.startSelection(filter);
        if (selectedTarget) {
            if (!selectedTarget.isOnline) {
                return this.launchSimulator(selectedTarget);
            } else {
                return AndroidTarget.fromInterface(selectedTarget);
            }
        }
    }

    public async collectTargets(): Promise<void> {
        const targetList: IMobileTarget[] = [];

        let emulatorsNames: string[] = await this.adbHelper.getAvdsNames();
        targetList.push(...emulatorsNames.map(name => {
            return {name, isOnline: false, isVirtualTarget: true};
        }));

        const onlineTargets = await this.adbHelper.getOnlineDevices();
        for (let device of onlineTargets) {
            if (device.isVirtualTarget) {
                const avdName = await this.adbHelper.getAvdNameById(device.id);
                const emulatorTarget = targetList.find(target => target.name === avdName);
                if (emulatorTarget) {
                    emulatorTarget.isOnline = true;
                    emulatorTarget.id = device.id;
                }
            } else {
                targetList.push({id: device.id, isOnline: true, isVirtualTarget: false});
            }
        }

        this.targets = targetList;
    }

    protected async startSelection(filter?: (el: IMobileTarget) => boolean): Promise<IMobileTarget | undefined> {
        return this.selectTarget(filter);
    }

    protected async launchSimulator(emulatorTarget: IMobileTarget): Promise<AndroidTarget> {
        return new Promise<AndroidTarget>((resolve, reject) => {
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
                        resolve(AndroidTarget.fromInterface(emulatorTarget));
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
}
