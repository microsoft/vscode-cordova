// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IGeneralLaunchResult {
    devServerPort?: number;
}

export type IAndroidLaunchResult = IGeneralLaunchResult;

export type IBrowserLaunchResult = IGeneralLaunchResult;

export type IIosLaunchResult = IGeneralLaunchResult;
