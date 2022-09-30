// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.
import * as nls from "vscode-nls";
import { InternalErrorCode } from "./internalErrorCode";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export const ERROR_STRINGS = {
    [InternalErrorCode.CommandFailed]: localize(
        "CommandFailed",
        "Error while executing command '{0}'",
    ),
    [InternalErrorCode.CommandFailedWithDetails]: localize(
        "CommandFailed",
        "Error while executing command '{0}'.\nDetails: {1}",
    ),
    [InternalErrorCode.CancellationTokenTriggered]: localize(
        "CancellationTokenTriggered",
        "Operation canceled",
    ),
    [InternalErrorCode.CouldNotConnectToDebugTarget]: localize(
        "CouldNotConnectToDebugTarget",
        "Could not connect to the debug target at {0}: {1}",
    ),
    [InternalErrorCode.CwdUndefined]: localize(
        "CwdUndefined",
        "Launch argument 'cwd' is undefined, please add it to your launch.json. Example: 'cwd': '${workspaceFolder}' to point to your current working directory",
    ),
    [InternalErrorCode.CouldNotStartChildDebugSession]: localize(
        "CouldNotStartChildDebugSession",
        "Could not start child debug session",
    ),
    [InternalErrorCode.CouldNotConnectToDebuggerWorkerProxyOffline]: localize(
        "CouldNotConnectToDebuggerWorkerProxyOffline",
        "Could not connect to debugger worker: Chrome debugger proxy is offline",
    ),
    [InternalErrorCode.UnableToFindXCodeProjFile]: localize(
        "UnableToFindXCodeProjFile",
        "Unable to find xcodeproj file",
    ),
    [InternalErrorCode.CouldNotFindWebInspectorSocketOniOSSimulator]: localize(
        "CouldNotFindWebInspectorSocketOniOSSimulator",
        "Couldn't find a web inspector socket for the simulator udid: {0}",
    ),
    [InternalErrorCode.UnableToStartiDeviceInstaller]: localize(
        "UnableToStartiDeviceInstaller",
        "Unable to find ideviceinstaller",
    ),
    [InternalErrorCode.UnableToListInstalledApplicationsOnDevice]: localize(
        "UnableToListInstalledApplicationsOnDevice",
        "Unable to list installed applications on device",
    ),
    [InternalErrorCode.ApplicationNotInstalledOnTheDevice]: localize(
        "ApplicationNotInstalledOnTheDevice",
        "Application not installed on the device",
    ),
    [InternalErrorCode.ApplicationPathNotExistingOniOSSimulator]: localize(
        "ApplicationPathNotExistingOniOSSimulator",
        "Could not detect installed apps on the simulator: the path {0} doesn't exist",
    ),
    [InternalErrorCode.ApplicationNotInstalledOnTheSimulator]: localize(
        "ApplicationNotInstalledOnTheSimulator",
        "Application not installed on the simulator",
    ),
    [InternalErrorCode.UnableToGetDeviceOSVersion]: localize(
        "UnableToGetDeviceOSVersion",
        "Unable to get device OS version. Details: {0}",
    ),
    [InternalErrorCode.CouldNotFindAnyDebuggableTarget]: localize(
        "CouldNotFindAnyDebuggableTarget",
        "Could not find any debuggable target",
    ),
    [InternalErrorCode.CouldNotFindiOSAppFile]: localize(
        "CouldNotFindiOSAppFile",
        "Could not find .app file",
    ),
    [InternalErrorCode.CouldNotFindWorkspaceManager]: localize(
        "CouldNotFindWorkspaceManager",
        "Could not find workspace manager by the project root path: {0}",
    ),
    [InternalErrorCode.LaunchSimHostBeforeStartSimulationServer]: localize(
        "LaunchSimHostBeforeStartSimulationServer",
        "Please launch sim host before starting simulation server",
    ),
    [InternalErrorCode.CouldntFindPlatformInProject]: localize(
        "CouldntFindPlatformInProject",
        "Couldn't find platform {0} in project, please install it using {1} platform add {2}",
    ),
    [InternalErrorCode.ErrorStartingTheSimulation]: localize(
        "ErrorStartingTheSimulation",
        "Error starting the simulation",
    ),
    [InternalErrorCode.ErrorRunningAndroid]: localize(
        "ErrorRunningAndroid",
        "Error running android",
    ),
    [InternalErrorCode.ServingToTheBrowserIsSupportedForIonicProjects]: localize(
        "ServingToTheBrowserIsSupportedForIonicProjects",
        "Serving to the browser is currently only supported for Ionic projects",
    ),
    [InternalErrorCode.UnableToFindiOSTargetDeviceOrSimulator]: localize(
        "UnableToFindiOSTargetDeviceOrSimulator",
        "Unable to find iOS target device/simulator. Please check that `Settings > Safari > Advanced > Web Inspector = ON` or try specifying a different `port` parameter in launch.json",
    ),
    [InternalErrorCode.UnableToFindTargetApp]: localize(
        "UnableToFindTargetApp",
        "Unable to find target app",
    ),
    [InternalErrorCode.WebsocketDebuggerUrlIsEmpty]: localize(
        "WebsocketDebuggerUrlIsEmpty",
        "WebSocket Debugger Url is empty",
    ),
    [InternalErrorCode.PlatformSelectionWasCancelled]: localize(
        "PlatformSelectionWasCancelled",
        "Platform selection was canceled. Please select target platform to continue",
    ),
    [InternalErrorCode.CouldNotFindAnyPlatformInstalled]: localize(
        "CouldNotFindAnyPlatformInstalled",
        "Could not find any platforms installed",
    ),
    [InternalErrorCode.UnableToFindLocalAbstractName]: localize(
        "UnableToFindLocalAbstractName",
        "Unable to find 'localabstract' name of Cordova app",
    ),
    [InternalErrorCode.UnableToFindWebview]: localize(
        "UnableToFindWebview",
        "Unable to find Webview",
    ),
    [InternalErrorCode.UnknownPlatform]: localize("UnknownPlatform", "Unknown platform: {0}"),
};
