// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {ChromeDebugSession, BaseSourceMapTransformer, BasePathTransformer} from "vscode-chrome-debug-core";
import {CordovaDebugAdapter} from "./cordovaDebugAdapter";
import {CordovaPathTransformer} from "./cordovaPathTransformer";

ChromeDebugSession.run(ChromeDebugSession.getSession({
    adapter: CordovaDebugAdapter,
    extensionName: "cordova-tools",
    pathTransformer: <typeof BasePathTransformer><any>CordovaPathTransformer,
    sourceMapTransformer: BaseSourceMapTransformer,
}));