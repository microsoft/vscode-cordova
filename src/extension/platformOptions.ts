// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { IProjectType } from "../utils/cordovaProjectHelper";
import { CordovaWorkspaceManager } from "./cordovaWorkspaceManager";
import * as vscode from "vscode";
import simulate = require("cordova-simulate");
import IonicDevServer from "../utils/ionicDevServer";

export interface IGeneralPlatformOptions {
    projectRoot: string;
    projectType: IProjectType;
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
    protocolServerStop: () => void;
    changeSimulateViewport: (data: simulate.ResizeViewportData) => Promise<void>;

    platform?: string;
    url?: string;
    livereload?: boolean;
    livereloadDelay?: number;
    forcePrepare?: boolean;
    simulationPath?: string;
    corsProxy?: boolean;
    simulatePort?: number;
    simulateTempDir?: string;
}

