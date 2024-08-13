// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import { CordovaCommandHelper } from "../../utils/cordovaCommandHelper";
import { commandWrapper } from "./commandUtil";

export class cordovaRequirements {
    static codeName = "cordova.requirements";
    static createHandler = () => {
        const options: vscode.QuickPickItem[] = [
            { label: "Android", description: "Verify requirements for Android platform" },
            { label: "IOS", description: "Verify requirements for IOS platform" },
            { label: "Browser", description: "Verify requirements for Browser platform" },
            { label: "Electron", description: "Verify requirements for Electron platform" },
        ];

        vscode.window.showQuickPick(options).then(selection => {
            if (!selection) {
                return;
            }

            const platform = selection.label;

            commandWrapper(CordovaCommandHelper.executeCordovaCommand, [
                `requirements ${platform}`,
            ]);
        });
    };
}
