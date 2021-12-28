// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IGeneralLaunchOptions {
    devServerPort?: number;
}

export type IAndroidLaunchOptions = IGeneralLaunchOptions;

export type IBrowserLaunchOptions = IGeneralLaunchOptions;

export type IIosLaunchOptions = IGeneralLaunchOptions;
