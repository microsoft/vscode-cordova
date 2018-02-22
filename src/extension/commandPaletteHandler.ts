// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as Q from "q";
import { AppCenterCommandPalleteHandler } from "./appcenter/appCenterCommandPalleteHandler";
import { AppCenterCommandType } from "./appcenter/appCenterConstants";
import { AppCenterExtensionManager } from "./appcenter/appCenterExtensionManager";

interface ICordovaStuff {
    appCenterManager: AppCenterExtensionManager; // Actually not an RN Stuff, but this is RN only extension so no other than RN stuff could exist at all, yeah?
}

interface ICordovaProject extends ICordovaStuff {
    workspaceFolder: vscode.WorkspaceFolder;
}

export class CommandPaletteHandler {
    private static projectsCache: {[key: string]: ICordovaProject} = {};
    // Use this class to further cmd exec delegation and not to pollute this class with AppCenter logic
    private static appCenterCommandPalleteHandler: AppCenterCommandPalleteHandler;

    public static appCenterLogin(): Q.Promise<void> {
        return this.selectProject()
            .then((project: ICordovaProject) => {
                return CommandPaletteHandler.getAppCenterCommandPalleteHandler(project).run(AppCenterCommandType.Login);
        });
    }

    public static appCenterLogout(): Q.Promise<void> {
        return this.selectProject()
            .then((project: ICordovaProject) => {
                 return CommandPaletteHandler.getAppCenterCommandPalleteHandler(project).run(AppCenterCommandType.Logout);
        });
    }

    public static appCenterWhoAmI(): Q.Promise<void> {
        return this.selectProject()
             .then((project: ICordovaProject) => {
                 return CommandPaletteHandler.getAppCenterCommandPalleteHandler(project).run(AppCenterCommandType.Whoami);
        });
    }

    private static getAppCenterCommandPalleteHandler(project: ICordovaProject): AppCenterCommandPalleteHandler {
        if (!CommandPaletteHandler.appCenterCommandPalleteHandler) {
            CommandPaletteHandler.appCenterCommandPalleteHandler = new AppCenterCommandPalleteHandler(CommandPaletteHandler.logger);
        }
        CommandPaletteHandler.appCenterCommandPalleteHandler.AppCenterManager = project.appCenterManager;
        return CommandPaletteHandler.appCenterCommandPalleteHandler;
    }

    private static selectProject(): Q.Promise<ICordovaProject> {
        let keys = Object.keys(this.projectsCache);
        if (keys.length > 1) {
            return Q.Promise((resolve, reject) => {
                vscode.window.showQuickPick(keys)
                    .then((selected) => {
                        if (selected) {
                            resolve(this.projectsCache[selected]);
                        }
                    }, reject);
            });
        } else if (keys.length === 1) {
            return Q.resolve(this.projectsCache[keys[0]]);
        } else {
            return Q.reject();
        }
    }
}
