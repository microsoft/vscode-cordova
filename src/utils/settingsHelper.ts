/**
 *******************************************************
 *                                                     *
 *   Copyright (C) Microsoft. All rights reserved.     *
 *                                                     *
 *******************************************************
 */

import * as os from 'os';
import * as path from 'path';

export function settingsHome(): string {
    switch (os.platform()) {
        case 'win32':
            return path.join(process.env['APPDATA'], 'vscode-cordova');
        case 'darwin':
        case 'linux':
            return path.join(process.env['HOME'], '.vscode-cordova');
        default:
            throw new Error('UnexpectedPlatform');
    };
}