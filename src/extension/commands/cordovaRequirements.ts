// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CordovaCommandHelper } from "../../utils/cordovaCommandHelper";
import { commandWrapper } from "./commandUtil";

export class cordovaRequirements {
    static codeName = "cordova.requirements";
    static createHandler = () => {
        commandWrapper(CordovaCommandHelper.executeCordovaCommand, ["requirements"]);
    };
}
