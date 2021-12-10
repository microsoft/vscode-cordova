// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as nls from "vscode-nls";
import { TargetType } from "../debugger/cordovaDebugSession";
import { MobileTarget, IMobileTarget } from "../utils/mobileTarget";
import { MobileTargetManager } from "../utils/mobileTargetManager";
import AbstractPlatform from "./abstractPlatform";
nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export default abstract class AbstractMobilePlatform extends AbstractPlatform {

    protected targetManager: MobileTargetManager;
    public target?: MobileTarget;

    public async getTargetsCountByFilter(filter?: (el: IMobileTarget) => boolean): Promise<number> {
        return this.targetManager.getTargetsCountWithFilter(filter);
    }

    public async resolveMobileTarget(targetString: string, additionalFilter?: (el: IMobileTarget) => boolean): Promise<MobileTarget | undefined> {
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
            this.target = await this.targetManager.selectAndPrepareTarget(target => {
                const conditionForNotAnyTarget = isAnyTarget
                    ? true
                    : target.name === targetString || target.id === targetString;
                const conditionForVirtualTarget = isVirtualTarget === target.isVirtualTarget;
                const additionalCondition = additionalFilter ? additionalFilter(target) : true;
                return conditionForVirtualTarget && conditionForNotAnyTarget && additionalCondition;
            });

            if (!this.target) {
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
                this.addTargetToRunArgs(this.target);
            }
        } catch (error) {
            if (error) {
                this.log(error);
                this.log(
                    localize(
                        "ContinueWithCordovaCliWorkflow",
                        "Continue using standard Cordova CLI workflow.",
                    ),
                );

                cleanupTargetModifications();
            } else {
                throw error;
            }
        }

        return this.target;
    }

    protected addTargetToRunArgs(target: MobileTarget): void {
        this.platformOpts.target = target.id;
        this.runArguments = this.getRunArguments();
    }

    public abstract getTargetFromRunArgs(): MobileTarget | undefined;
}
