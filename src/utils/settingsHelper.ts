// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
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
    };
}
export class SettingsHelper {

    /**
     * Get appcenter login endpoint setting
     */
    public static getAppCenterLoginEndpoint(): string {
        const workspaceConfiguration = vscode.workspace.getConfiguration();
        if (workspaceConfiguration.has('cordova.appcenter.loginendpoint')) {
            let loginEndpoint: string = ConfigurationReader.readString(workspaceConfiguration.get('cordova.appcenter.loginendpoint'));
            return loginEndpoint;
        }
        return ACConstants.DefaultLoginEndPoint;
    }

    /**
     * Get appcenter api endpoint setting
     */
   public static getAppCenterAPIEndpoint(): string {
        const workspaceConfiguration = vscode.workspace.getConfiguration();
        if (workspaceConfiguration.has('cordova.appcenter.api.endpoint')) {
            let apiEndpoint: string = ConfigurationReader.readString(workspaceConfiguration.get('cordova.appcenter.api.endpoint'));
            return apiEndpoint;
        }
        return ACConstants.DefaulAPIEndPoint;
   }

    /**
     * Get old codepush endpoint setting
     */
    public static getLegacyCodePushEndpoint(): string {
        const workspaceConfiguration = vscode.workspace.getConfiguration();
        if (workspaceConfiguration.has('cordova.appcenter.legacycodepushservice')) {
            let apiEndpoint: string = ConfigurationReader.readString(workspaceConfiguration.get('cordova.appcenter.legacycodepushservice'));
            return apiEndpoint;
        }
        return ACConstants.DefaultLegacyCodePushService;
    }

   public static getLegacyCodePushServiceEnabled(): boolean {
        const workspaceConfiguration = vscode.workspace.getConfiguration();
        if (workspaceConfiguration.has('cordova.appcenter.legacycodepushserviceenabled')) {
            let enabled: boolean = ConfigurationReader.readBoolean(workspaceConfiguration.get('cordova.appcenter.legacycodepushserviceenabled'));
            return enabled;
        }
        return true;
   }
}