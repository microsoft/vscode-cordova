// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

export enum InternalErrorCode {
    // Command error
    CommandFailed = 101,
    CommandFailedWithDetails = 102,
    NvsHomeNotFoundMessage = 103,
    NvmWindowsNotFoundMessage = 104,
    NvmHomeNotFoundMessage = 105,
    RuntimeVersionNotFoundMessage = 106,

    // Platform& Simulate error
    UnknownPlatform = 201,
    CouldNotFindWebInspectorSocketOniOSSimulator = 202,
    UnableToStartiDeviceInstaller = 203,
    UnableToListInstalledApplicationsOnDevice = 204,
    ApplicationNotInstalledOnTheDevice = 205,
    ApplicationNotInstalledOnTheSimulator = 206,
    ApplicationPathNotExistingOniOSSimulator = 207,
    UnableToGetDeviceOSVersion = 208,
    LaunchSimHostBeforeStartSimulationServer = 209,
    CouldntFindPlatformInProject = 210,
    ErrorStartingTheSimulation = 211,
    ErrorRunningAndroid = 212,
    ServingToTheBrowserIsSupportedForIonicProjects = 213,
    UnableToFindiOSTargetDeviceOrSimulator = 214,
    UnableToFindTargetApp = 215,
    PlatformSelectionWasCancelled = 216,
    CouldNotFindAnyPlatformInstalled = 217,
    CouldNotRecognizeTargetType = 218,
    UnexpectedPlatform = 219,
    iOSSimulatorLaunchFailed = 220,

    // User input errors
    ExpectedArrayValue = 301,
    CwdUndefined = 302,
    InvalidVersionString = 303,
    CWDCouldNotReferToTheWorkspaceRootDirectory = 304,

    // Debug errors
    CouldNotConnectToDebugTarget = 401,
    CouldNotStartChildDebugSession = 402,
    CouldNotConnectToDebuggerWorkerProxyOffline = 403,
    CouldNotFindAnyDebuggableTarget = 404,
    WebsocketDebuggerUrlIsEmpty = 405,
    UnableToFindLocalAbstractName = 406,
    UnableToFindWebview = 407,
    UnableToDetermineTheIonicDevServerAddress = 408,

    // Miscellaneous errors
    CancellationTokenTriggered = 501,
    UnableToFindXCodeProjFile = 502,
    CouldNotFindiOSAppFile = 503,
    CouldNotFindWorkspaceManager = 504,
    UnknownError = 505,
}
