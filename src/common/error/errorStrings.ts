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
    [InternalErrorCode.UnknownPlatform]: localize("UnknownPlatform", "Unknown platform: {0}"),
};
