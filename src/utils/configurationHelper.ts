import {ConfigurationReader} from '../common/configurationReader';
import {ACConstants} from '../extension/appcenter/appCenterConstants';
import * as vscode from 'vscode';

export class ConfigurationHelper {

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