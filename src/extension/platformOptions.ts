// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import { ProjectType } from "../utils/cordovaProjectHelper";
import IonicDevServer from "../utils/ionicDevServer";
import { CordovaWorkspaceManager } from "./cordovaWorkspaceManager";
import { PluginSimulator } from "./simulate";

export interface IGeneralPlatformOptions {
    projectRoot: string;
    projectType: ProjectType;
    workspaceManager: CordovaWorkspaceManager;
    ionicDevServer: IonicDevServer;
    cordovaExecutable: string;
    cancellationTokenSource: vscode.CancellationTokenSource;
    env: any;
    port: number;
    target?: string;
    ionicLiveReload?: boolean;
    runArguments?: string[];
}

export interface IIosPlatformOptions extends IGeneralPlatformOptions {
    iosDebugProxyPort: number;
    webkitRangeMin: number;
    webkitRangeMax: number;
    attachAttempts: number;
    attachDelay: number;
}

export type IAndroidPlatformOptions = IGeneralPlatformOptions;

export interface IBrowserPlatformOptions extends IGeneralPlatformOptions {
    userDataDir: string;
    pluginSimulator: PluginSimulator;

    platform?: string;
    url?: string;
    livereload?: boolean;
    livereloadDelay?: number;
    forcePrepare?: boolean;
    corsProxy?: boolean;
    simulatePort?: number;
    simulateTempDir?: string;
    spaUrlRewrites?: boolean;
}
