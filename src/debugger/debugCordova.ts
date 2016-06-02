// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as fs from 'fs';
import * as path from 'path';

import {CordovaDebugSession} from './cordovaDebugSession';
import {DebugSession} from '../../debugger/common/debugSession';

import {Telemetry} from '../utils/telemetry';

let projectRoot = path.join(__dirname, '..', '..', '..');
let version = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')).version;

// Enable telemetry, forced on for now.
Telemetry.init('cordova-tools-debug-adapter', version, {isExtensionProcess: false}, projectRoot).then(() => {
    DebugSession.run(CordovaDebugSession);
});
