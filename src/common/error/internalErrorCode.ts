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

    // CDP Proxy errors
    CouldNotConnectToDebugTarget = 401,

    // Miscellaneous errors
    CancellationTokenTriggered = 501,
}
