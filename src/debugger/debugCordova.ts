// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {CordovaDebugSession} from './cordovaDebugSession';
import {DebugSession} from '../../debugger/common/debugSession';

import {Telemetry} from '../utils/telemetry';
import {TelemetryHelper} from '../utils/telemetryHelper';

// Enable telemetry, forced on for now.
Telemetry.init('vscode-cordova-debug-adapter', require('./../../../package.json').version, true).then(() => {
    DebugSession.run(CordovaDebugSession);
});
