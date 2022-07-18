// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as nls from "vscode-nls";
import { TargetType } from "../debugger/cordovaDebugSession";
import { MobileTargetManager } from "../utils/mobileTargetManager";
import { IDebuggableMobileTarget, IMobileTarget, MobileTarget } from "../utils/mobileTarget";
import AbstractPlatform from "./abstractPlatform";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export default abstract class AbstractMobilePlatform<
    Target extends MobileTarget = MobileTarget,
    TargetManager extends MobileTargetManager<Target> = MobileTargetManager<Target>,
> extends AbstractPlatform {
    protected targetManager: TargetManager;
    protected _target?: Target;

    get target(): Target | undefined {
        return this._target;
    }

    public async getTargetsCountByFilter(filter?: (el: IMobileTarget) => boolean): Promise<number> {
        return (await this.targetManager.getTargetList(filter)).length;
    }

    public async resolveMobileTarget(
        targetString: string,
        additionalFilter?: (el: IMobileTarget) => boolean,
    ): Promise<Target | undefined> {
        let collectTargetsCalled = false;

        let isAnyTarget = false;
        let isVirtualTarget: boolean;
        if (targetString.toLowerCase() === TargetType.Emulator) {
            isAnyTarget = true;
            isVirtualTarget = true;
        } else if (targetString.toLowerCase() === TargetType.Device) {
            isAnyTarget = true;
            isVirtualTarget = false;
        } else {
            await this.targetManager.collectTargets();
            collectTargetsCalled = true;
            isVirtualTarget = await this.targetManager.isVirtualTarget(targetString);
        }

        if (!collectTargetsCalled) {
            await this.targetManager.collectTargets(
                isVirtualTarget ? TargetType.Emulator : TargetType.Device,
            );
        }

        const cleanupTargetModifications = () => {
            // Use 'emulator' or 'device' in case we need to specify target
            this.platformOpts.target = isVirtualTarget ? TargetType.Emulator : TargetType.Device;
            this.runArguments = this.getRunArguments();
        };

        try {
            this._target = await this.targetManager.selectAndPrepareTarget(target => {
                const conditionForNotAnyTarget = isAnyTarget
                    ? true
                    : target.name === targetString || target.id === targetString;
                const conditionForVirtualTarget = isVirtualTarget === target.isVirtualTarget;
                const additionalCondition = additionalFilter ? additionalFilter(target) : true;
                return conditionForVirtualTarget && conditionForNotAnyTarget && additionalCondition;
            });

            if (!this._target) {
                this.log(
                    localize(
                        "CouldNotFindAnyDebuggableTarget",
                        "Could not find any debuggable target by specified target: {0}",
                        targetString,
                    ),
                );
                this.log(
                    localize(
                        "ContinueWithCordovaCliWorkflow",
                        "Continue using standard Cordova CLI workflow.",
                    ),
                );
                cleanupTargetModifications();
            } else {
                this.addTargetToRunArgs(this._target);
            }
        } catch (error) {
            this.log(error);
            this.log(
                localize(
                    "ContinueWithCordovaCliWorkflow",
                    "Continue using standard Cordova CLI workflow.",
                ),
            );
            cleanupTargetModifications();
        }

        return this._target;
    }

    public abstract getTargetFromRunArgs(): Promise<Target | undefined>;

    protected abstract getFirstAvailableOnlineTarget(): Promise<Target>;

    protected async getPreferredTarget(): Promise<Target> {
        if (!this._target) {
            this._target =
                (await this.getTargetFromRunArgs()) || (await this.getFirstAvailableOnlineTarget());
        }
        return this._target;
    }

    protected async getFirstDebuggableTarget(): Promise<IDebuggableMobileTarget> {
        const targets = (await this.targetManager.getTargetList(
            target => target.isOnline && !!target.id,
        )) as IDebuggableMobileTarget[];
        const targetsBySpecifiedType = targets.filter(target => {
            switch (this.platformOpts.target) {
                case TargetType.Emulator:
                    return target.isVirtualTarget;
                case TargetType.Device:
                    return !target.isVirtualTarget;
                case undefined:
                case "":
                    return true;
                default:
                    return (
                        target.id === this.platformOpts.target ||
                        target.name === this.platformOpts.target
                    );
            }
        });

        if (targetsBySpecifiedType.length) {
            return targetsBySpecifiedType[0];
        } else if (targets.length) {
            this.log(
                localize(
                    "ThereIsNoOnlineTargetWithSpecifiedTargetType",
                    "There is no any online target with specified target type '{0}'. Continue with any online target.",
                    this.platformOpts.target,
                ),
            );
            return targets[0];
        }

        throw Error(
            localize(
                "IosThereIsNoAnyOnlineDebuggableTarget",
                "There is no any iOS debuggable online target",
            ),
        );
    }

    protected addTargetToRunArgs(target: Target): void {
        this.platformOpts.target = target.id;
        this.runArguments = this.getRunArguments();
    }
}
