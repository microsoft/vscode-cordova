// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IGeneralAttachResult {}

export type IAndroidAttachResult = IGeneralAttachResult;

export type IBrowserAttachResult = IGeneralAttachResult;

export interface IIosAttachResult extends IGeneralAttachResult {
    webSocketDebuggerUrl: string;
    iOSVersion: string;
    iOSAppPackagePath: string;
    devServerAddress: string;
}
