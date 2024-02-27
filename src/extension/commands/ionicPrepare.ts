// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CordovaCommandHelper } from "../../utils/cordovaCommandHelper";
import { commandWrapper } from "./commandUtil";

export class IonicPrepare {
    static codeName = "ionic.prepare";
    static createHandler = () =>
        commandWrapper(CordovaCommandHelper.executeCordovaCommand, ["prepare", true]);
}
