// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { window } from "vscode";
import { CordovaCommandHelper } from "../../utils/cordovaCommandHelper";
import { commandWrapper } from "./commandUtil";

export class Telemetry {
    static codeName = "cordova.telemetry";
    static createHandler = () => {
        window.showQuickPick(["On", "Off"]).then(value => {
            commandWrapper(CordovaCommandHelper.executeCordovaCommand, [
                `telemetry ${value.toLowerCase()}`,
            ]);
        });
    };
}
