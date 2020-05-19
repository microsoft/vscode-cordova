// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import {CordovaWorkspaceManager} from "./cordovaWorkspaceManager";

export class ProjectsStorage {
    public static readonly projectsCache: {[key: string]: CordovaWorkspaceManager} = {};

    public static addFolder(workspaceFolder: vscode.WorkspaceFolder, workspaceManager: CordovaWorkspaceManager): void {
        this.projectsCache[workspaceFolder.uri.fsPath.toLowerCase()] = workspaceManager;
    }

    public static getFolder(workspaceFolder: vscode.WorkspaceFolder): CordovaWorkspaceManager {
        return this.projectsCache[workspaceFolder.uri.fsPath.toLowerCase()];
    }

    public static delFolder(workspaceFolder: vscode.WorkspaceFolder): void {
        delete this.projectsCache[workspaceFolder.uri.fsPath.toLowerCase()];
    }
}
