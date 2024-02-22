// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { SimulateOptions } from "cordova-simulate";
import { ProjectsStorage } from "../projectsStorage";
import { CordovaWorkspaceManager } from "../cordovaWorkspaceManager";
import { TelemetryHelper } from "../../utils/telemetryHelper";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export function selectProject(): Promise<CordovaWorkspaceManager> {
    const keys = Object.keys(ProjectsStorage.projectsCache);
    if (keys.length > 1) {
        return new Promise((resolve, reject) => {
            vscode.window.showQuickPick(keys).then(selected => {
                if (selected) {
                    resolve(ProjectsStorage.projectsCache[selected]);
                }
            }, reject);
        });
    } else if (keys.length === 1) {
        return Promise.resolve(ProjectsStorage.projectsCache[keys[0]]);
    }
    return Promise.reject(
        new Error(localize("NoCordovaProjectIsFound", "No Cordova project is found")),
    );
}

export function commandWrapper(fn, args) {
    return selectProject().then(project => {
        return fn(project.workspaceRoot.uri.fsPath, ...args);
    });
}
/* Launches a simulate command and records telemetry for it */
export function launchSimulateCommand(
    cordovaProjectRoot: string,
    options: SimulateOptions,
): Promise<void> {
    return TelemetryHelper.generate("simulateCommand", generator => {
        return TelemetryHelper.determineProjectTypes(cordovaProjectRoot).then(projectType => {
            generator.add(
                "simulateOptions",
                {
                    platform: options.platform,
                    target: options.target,
                    livereload: options.livereload,
                    forceprepare: options.forceprepare,
                    corsproxy: options.corsproxy,
                },
                false,
            );
            generator.add(
                "projectType",
                TelemetryHelper.prepareProjectTypesTelemetry(projectType),
                false,
            );
            // visibleTextEditors is null proof (returns empty array if no editors visible)
            generator.add(
                "visibleTextEditorsCount",
                vscode.window.visibleTextEditors.length,
                false,
            );
            return projectType;
        });
    }).then(projectType => {
        const uri = vscode.Uri.file(cordovaProjectRoot);
        const workspaceFolder = <vscode.WorkspaceFolder>vscode.workspace.getWorkspaceFolder(uri);
        return ProjectsStorage.getFolder(workspaceFolder).pluginSimulator.simulate(
            cordovaProjectRoot,
            options,
            projectType,
        );
    });
}
