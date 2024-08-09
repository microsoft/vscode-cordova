// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CordovaCommandHelper } from "../../utils/cordovaCommandHelper";
import { CordovaSessionManager } from "../cordovaSessionManager";
import { commandWrapper } from "./commandUtil";

export class Restart {
    static codeName = "cordova.restart";
    static createHandler = () =>
        commandWrapper(CordovaCommandHelper.restartCordovaDebugging, [new CordovaSessionManager()]);
}
