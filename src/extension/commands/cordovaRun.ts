// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CordovaCommandHelper } from "../../utils/cordovaCommandHelper";
import { commandWrapper } from "./commandUtil";

export class CordovaRun {
    static codeName = "cordova.run";
    static createHandler = () =>
        commandWrapper(CordovaCommandHelper.executeCordovaCommand, ["run"]);
}
