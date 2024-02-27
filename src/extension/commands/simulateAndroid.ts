// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.
import * as vscode from "vscode";
import { selectProject, launchSimulateCommand } from "./commandUtil";

export class SimulateAndroid {
    static codeName = "cordova.simulate.android";
    static createHandler = () => {
        return selectProject().then(project => {
            return launchSimulateCommand(project.workspaceRoot.uri.fsPath, {
                dir: project.workspaceRoot.uri.fsPath,
                target: "chrome",
                platform: "android",
                lang: vscode.env.language,
            });
        });
    };
}
