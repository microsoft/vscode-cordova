// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as nls from "vscode-nls";
import { QuickPickOptions, window } from "vscode";
import { IMobileTarget, MobileTarget } from "./MobileTarget";
nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export abstract class MobileTargetManager {
    protected targets?: IMobileTarget[];

    public abstract collectTargets(): Promise<void>;

    public abstract selectAndPrepareTarget(filter?: (el: IMobileTarget) => boolean): Promise<MobileTarget | undefined>;

    public async isVirtualTarget(target: string): Promise<boolean> {
        if (target.includes("device")) {
            return false;
        }
        if (target.includes("emulator")) {
            return true;
        }
    }

    protected abstract launchSimulator(emulatorTarget: IMobileTarget): Promise<MobileTarget | undefined>;

    protected abstract startSelection(filter?: (el: IMobileTarget) => boolean): Promise<IMobileTarget | undefined>;

    protected async getTargetList(filter?: (el: IMobileTarget) => boolean): Promise<IMobileTarget[]> {
        if (!this.targets) {
            await this.collectTargets();
        }
        return filter ? this.targets.filter(filter) : this.targets;
    }

    protected async selectTarget(
        filter?: (el: IMobileTarget) => boolean,
    ): Promise<IMobileTarget | undefined> {
        const targetList = await this.getTargetList(filter);
        const quickPickOptions: QuickPickOptions = {
            ignoreFocusOut: true,
            canPickMany: false,
            placeHolder: localize(
                "SelectTargetDevice",
                "Select target device for launch application",
            ),
        };
        let result: string | undefined = targetList[0]?.name || targetList[0]?.id;
        if (targetList.length > 1) {
            result = await window.showQuickPick(targetList.map(target => target?.name || target?.id), quickPickOptions);
        }
        return targetList.find(target => target.name === result || target.id === result);
    }
}