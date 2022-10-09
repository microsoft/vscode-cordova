// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as nls from "vscode-nls";
import { MobileTargetManager } from "../mobileTargetManager";
import { ChildProcess } from "../../common/node/childProcess";
import { IDebuggableMobileTarget, IMobileTarget, MobileTarget } from "../mobileTarget";
import { TargetType } from "../../debugger/cordovaDebugSession";
import { AdbHelper } from "./adb";
import { ErrorHelper } from "../../common/error/errorHelper";
import { InternalErrorCode } from "../../common/error/internalErrorCode";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export class AndroidTarget extends MobileTarget {
    constructor(obj: IDebuggableMobileTarget) {
        const objCopy = Object.assign({}, obj);
        if (!objCopy.name) {
            objCopy.name = objCopy.id;
        }
        super(objCopy);
    }
}

export class AndroidTargetManager extends MobileTargetManager<AndroidTarget> {
    private static readonly EMULATOR_COMMAND = "emulator";
    private static readonly EMULATOR_AVD_START_COMMAND = "-avd";

    private static readonly EMULATOR_START_TIMEOUT = 120;

    private adbHelper: AdbHelper;
    private childProcess: ChildProcess;

    constructor(adbHelper: AdbHelper) {
        super();
        this.adbHelper = adbHelper;
        this.childProcess = new ChildProcess();
    }

    public async isVirtualTarget(target: string): Promise<boolean> {
        try {
            if (target === TargetType.Device) {
                return false;
            } else if (
                target === TargetType.Emulator ||
                target.match(AdbHelper.AndroidSDKEmulatorPattern)
            ) {
                return true;
            }
            const onlineTarget = await this.adbHelper.findOnlineTargetById(target);
            if (onlineTarget) {
                return onlineTarget.isVirtualTarget;
            } else if ((await this.adbHelper.getAvdsNames()).includes(target)) {
                return true;
            }
            throw Error();
        } catch {
            throw ErrorHelper.getInternalError(
                InternalErrorCode.CouldNotRecognizeTargetType,
                target,
            );
        }
    }

    public async selectAndPrepareTarget(
        filter?: (el: IMobileTarget) => boolean,
    ): Promise<AndroidTarget | undefined> {
        const selectedTarget = await this.startSelection(filter);
        if (selectedTarget) {
            if (!selectedTarget.isOnline) {
                return this.launchSimulator(selectedTarget);
            } else {
                if (selectedTarget.id) {
                    return new AndroidTarget(<IDebuggableMobileTarget>selectedTarget);
                }
            }
        }
    }

    public async collectTargets(
        targetType?: TargetType.Device | TargetType.Emulator,
    ): Promise<void> {
        const targetList: IMobileTarget[] = [];

        if (!targetType || targetType === TargetType.Emulator) {
            const emulatorsNames: string[] = await this.adbHelper.getAvdsNames();
            targetList.push(
                ...emulatorsNames.map(name => {
                    return { name, isOnline: false, isVirtualTarget: true };
                }),
            );
        }

        const onlineTargets = await this.adbHelper.getOnlineTargets();
        for (const device of onlineTargets) {
            if (device.isVirtualTarget && (!targetType || targetType === TargetType.Emulator)) {
                const avdName = await this.adbHelper.getAvdNameById(device.id);
                const emulatorTarget = targetList.find(target => target.name === avdName);
                if (emulatorTarget) {
                    emulatorTarget.isOnline = true;
                    emulatorTarget.id = device.id;
                }
            } else if (
                !device.isVirtualTarget &&
                (!targetType || targetType === TargetType.Device)
            ) {
                targetList.push({
                    id: device.id,
                    isOnline: true,
                    isVirtualTarget: false,
                });
            }
        }

        this.targets = targetList;
    }

    protected async startSelection(
        filter?: (el: IMobileTarget) => boolean,
    ): Promise<IMobileTarget | undefined> {
        return this.selectTarget(filter);
    }

    protected async launchSimulator(emulatorTarget: IMobileTarget): Promise<AndroidTarget> {
        return new Promise<AndroidTarget>((resolve, reject) => {
            const emulatorProcess = this.childProcess.spawn(
                AndroidTargetManager.EMULATOR_COMMAND,
                [AndroidTargetManager.EMULATOR_AVD_START_COMMAND, emulatorTarget.name],
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
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                cleanup();
                reject(
                    new Error(
                        `Virtual device launch finished with an exception: ${localize(
                            "EmulatorStartWarning",
                            "Could not start the emulator {0} within {1} seconds.",
                            emulatorTarget.name,
                            AndroidTargetManager.EMULATOR_START_TIMEOUT,
                        )}`,
                    ),
                );
            }, AndroidTargetManager.EMULATOR_START_TIMEOUT * 1000);

            const bootCheckInterval = setInterval(async () => {
                const connectedDevices = await this.adbHelper.getOnlineTargets();
                for (let i = 0; i < connectedDevices.length; i++) {
                    const onlineAvdName = await this.adbHelper.getAvdNameById(
                        connectedDevices[i].id,
                    );
                    if (onlineAvdName === emulatorTarget.name) {
                        emulatorTarget.id = connectedDevices[i].id;
                        emulatorTarget.isOnline = true;
                        this.logger.log(
                            localize(
                                "EmulatorLaunched",
                                "Launched emulator {0}",
                                emulatorTarget.name,
                            ),
                        );
                        // eslint-disable-next-line @typescript-eslint/no-use-before-define
                        cleanup();
                        resolve(new AndroidTarget(<IDebuggableMobileTarget>emulatorTarget));
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
