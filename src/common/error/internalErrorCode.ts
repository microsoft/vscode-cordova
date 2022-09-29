// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

export enum InternalErrorCode {
    // Command error
    CommandFailed = 101,
    CommandFailedWithDetails = 102,

    // Platform error
    UnknownPlatform = 201,

    // User input errors
    ExpectedArrayValue = 301,
    CwdUndefined = 302,

    // Debug errors
    CouldNotConnectToDebugTarget = 401,
    CouldNotStartChildDebugSession = 402,
    CouldNotConnectToDebuggerWorkerProxyOffline = 403,
    CouldNotFindAnyDebuggableTarget = 404,

    // Miscellaneous errors
    CancellationTokenTriggered = 501,
    UnableToFindXCodeProjFile = 502,
    CouldNotFindWebInspectorSocketOniOSSimulator = 503,
    UnableToStartiDeviceInstaller = 504,
    UnableToListInstalledApplicationsOnDevice = 505,
    ApplicationNotInstalledOnTheDevice = 506,
    ApplicationNotInstalledOnTheSimulator = 507,
    ApplicationPathNotExistingOniOSSimulator = 508,
    UnableToGetDeviceOSVersion = 509,
    CouldNotFindiOSAppFile = 510,
    CouldNotFindWorkspaceManager = 511,
}
