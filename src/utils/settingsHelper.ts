// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as os from 'os';
import * as path from 'path';
import * as vscode from "vscode";
import {ConfigurationReader} from "../common/configurationReader";

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
        const defaultLoginEndPoint = "https://appcenter.ms/cli-login";
        if (workspaceConfiguration.has("cordova-tools.appcenter.loginendpoint")) {
            let loginEndpoint: string = ConfigurationReader.readString(workspaceConfiguration.get("cordova-tools.appcenter.loginendpoint"));
            return loginEndpoint;
        }
        return defaultLoginEndPoint;
    }

    /**
     * Get appcenter api endpoint setting
     */
   public static getAppCenterAPIEndpoint(): string {
       const workspaceConfiguration = vscode.workspace.getConfiguration();
       const defaulAPIEndPoint = "https://api.appcenter.ms";
       if (workspaceConfiguration.has("cordova-tools.appcenter.api.endpoint")) {
           let apiEndpoint: string = ConfigurationReader.readString(workspaceConfiguration.get("cordova-tools.appcenter.api.endpoint"));
           return apiEndpoint;
       }
       return defaulAPIEndPoint;
   }

   public static getLegacyCodePushEndpoint(): string {
       return '';
   }

   public static getLegacyCodePushServiceEnabled(): boolean {
       return true;
   }

}