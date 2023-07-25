// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as nls from "vscode-nls";
import { QuickPickOptions, window } from "vscode";
import { TargetType } from "../debugger/cordovaDebugSession";
import { ErrorHelper } from "../common/error/errorHelper";
import { InternalErrorCode } from "../common/error/internalErrorCode";
import { OutputChannelLogger } from "./log/outputChannelLogger";
import { IMobileTarget, MobileTarget } from "./mobileTarget";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export abstract class MobileTargetManager<T extends MobileTarget> {
    protected targets?: IMobileTarget[];

    protected logger: OutputChannelLogger = OutputChannelLogger.getChannel(
        OutputChannelLogger.MAIN_CHANNEL_NAME,
        true,
    );

    public abstract collectTargets(
        targetType?: TargetType.Device | TargetType.Emulator,
    ): Promise<void>;

    public abstract selectAndPrepareTarget(
        filter?: (el: IMobileTarget) => boolean,
    ): Promise<T | undefined>;

    public async isVirtualTarget(target: string): Promise<boolean> {
        if (target === TargetType.Device) {
            return false;
        }
        if (target === TargetType.Emulator) {
            return true;
        }
        throw ErrorHelper.getInternalError(InternalErrorCode.CouldNotRecognizeTargetType, target);
    }

    public async getTargetList(filter?: (el: IMobileTarget) => boolean): Promise<IMobileTarget[]> {
        if (!this.targets) {
            await this.collectTargets();
        }
        return filter ? this.targets.filter(filter) : this.targets;
    }

    protected abstract launchSimulator(emulatorTarget: IMobileTarget): Promise<T | undefined>;

    protected abstract startSelection(
        filter?: (el: IMobileTarget) => boolean,
    ): Promise<IMobileTarget | undefined>;

    protected async selectTarget(
        filter?: (el: IMobileTarget) => boolean,
    ): Promise<IMobileTarget | undefined> {
        const targetList = await this.getTargetList(filter);
        let result: string | undefined = targetList[0]?.name || targetList[0]?.id;
        if (targetList.length > 1) {
            const quickPickOptions: QuickPickOptions = {
                ignoreFocusOut: true,
                canPickMany: false,
                placeHolder: localize(
                    "SelectTargetDevice",
                    "Select target device for launch application",
                ),
            };
            result = await window.showQuickPick(
                targetList.map(target => target?.name || target?.id),
                quickPickOptions,
            );
        }
        return result
            ? targetList.find(target => target.name === result || target.id === result)
            : undefined;
    }
}
