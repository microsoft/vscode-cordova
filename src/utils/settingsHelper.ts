// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as os from 'os';
import * as path from 'path';
import {ConfigurationReader} from '../common/configurationReader';
import {ACConstants} from '../extension/appcenter/appCenterConstants';

export function settingsHome(): string {
    switch (os.platform()) {
        case 'win32':
            return path.join(process.env['APPDATA'], 'vscode-cordova');
        case 'darwin':
        case 'linux':
            return path.join(process.env['HOME'], '.vscode-cordova');
        default:
            throw new Error('UnexpectedPlatform');
    }
}
export class SettingsHelper {

    /**
     * Get appcenter login endpoint setting
     */
    public static getAppCenterLoginEndpoint(): string {
        return ACConstants.DefaultLoginEndPoint;
    }

    /**
     * Get appcenter api endpoint setting
     */
   public static getAppCenterAPIEndpoint(): string {
        return ACConstants.DefaulAPIEndPoint;
   }

    /**
     * Get old codepush endpoint setting
     */
    public static getLegacyCodePushEndpoint(): string {
        return ACConstants.DefaultLegacyCodePushService;
    }

   public static getLegacyCodePushServiceEnabled(): boolean {
        return true;
   }
}