// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as nls from "vscode-nls";
import { QuickPickOptions, window } from "vscode";
nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export class Target {
    protected _name?: string;
    protected _id?: string;
    protected _isOnline: boolean;
    protected _isVirtualTarget: boolean;

    constructor(isOnline: boolean, isVirtualTarget: boolean, name?: string, id?: string) {
        this._isOnline = isOnline;
        this._isVirtualTarget = isVirtualTarget;
        this._name = name;
        this._id = id;
    }

    get name(): string | undefined {
        if (!this._name) {
            return this._id;
        }
        return this._name;
    }

    get id(): string | undefined {
        return this._id;
    }

    set id(id: string) {
        this._id = id;
    }

    get isOnline(): boolean {
        return this._isOnline;
    }

    set isOnline(isOnline: boolean) {
        this._isOnline = isOnline;
    }

    get isVirtualTarget(): boolean {
        return this._isVirtualTarget;
    }
}

export abstract class TargetManager {

    protected async selectTarget(
        filter?: (el: Target) => boolean,
    ): Promise<Target | undefined> {
        const targetList = await this.getTargetList(filter);
        const quickPickOptions: QuickPickOptions = {
            ignoreFocusOut: true,
            canPickMany: false,
            placeHolder: localize(
                "SelectTargetDevice",
                "Select target device for launch application",
            ),
        };
        let result: string | undefined = targetList[0]?.name;
        if (targetList.length > 1) {
            result = await window.showQuickPick(targetList.map(target => target.name), quickPickOptions);
        }
        return targetList.find(target => target.name === result);
    }

    public abstract startSelection(): Promise<Target | undefined>;

    public abstract getTargetList(
        filter?: (el: Target) => boolean,
    ): Promise<Target[]>;
}
