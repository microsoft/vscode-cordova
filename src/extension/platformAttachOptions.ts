// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IGeneralAttachOptions {}

export type IAndroidAttachOptions = IGeneralAttachOptions;

export type IBrowserAttachOptions = IGeneralAttachOptions;

export interface IIosAttachOptions extends IGeneralAttachOptions {
    webSocketDebuggerUrl: string;
    iOSVersion: string;
    iOSAppPackagePath: string;
    devServerAddress: string;
}
