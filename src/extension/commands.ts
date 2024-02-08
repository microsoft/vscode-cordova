// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { SimulateOptions } from "cordova-simulate";
import { CordovaSessionManager } from "./cordovaSessionManager";
import { CordovaCommandHelper } from "../utils/cordovaCommandHelper";
import { TelemetryHelper } from "../utils/telemetryHelper";
import { ProjectsStorage } from "./projectsStorage";
import { CordovaWorkspaceManager } from "./cordovaWorkspaceManager";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

let EXTENSION_CONTEXT: vscode.ExtensionContext;

export function registerCordovaCommands(cordovaSessionManager: CordovaSessionManager): void {
    EXTENSION_CONTEXT.subscriptions.push(
        vscode.commands.registerCommand("cordova.restart", () =>
            commandWrapper(CordovaCommandHelper.restartCordovaDebugging, [cordovaSessionManager]),
        ),
    );
    EXTENSION_CONTEXT.subscriptions.push(
        vscode.commands.registerCommand("cordova.prepare", () =>
            commandWrapper(CordovaCommandHelper.executeCordovaCommand, ["prepare"]),
        ),
    );
    EXTENSION_CONTEXT.subscriptions.push(
        vscode.commands.registerCommand("cordova.build", () =>
            commandWrapper(CordovaCommandHelper.executeCordovaCommand, ["build"]),
        ),
    );
    EXTENSION_CONTEXT.subscriptions.push(
        vscode.commands.registerCommand("cordova.run", () =>
            commandWrapper(CordovaCommandHelper.executeCordovaCommand, ["run"]),
        ),
    );
    EXTENSION_CONTEXT.subscriptions.push(
        vscode.commands.registerCommand("ionic.prepare", () =>
            commandWrapper(CordovaCommandHelper.executeCordovaCommand, ["prepare", true]),
        ),
    );
    EXTENSION_CONTEXT.subscriptions.push(
        vscode.commands.registerCommand("ionic.build", () =>
            commandWrapper(CordovaCommandHelper.executeCordovaCommand, ["build", true]),
        ),
    );
    EXTENSION_CONTEXT.subscriptions.push(
        vscode.commands.registerCommand("ionic.run", () =>
            commandWrapper(CordovaCommandHelper.executeCordovaCommand, ["run", true]),
        ),
    );
    EXTENSION_CONTEXT.subscriptions.push(
        vscode.commands.registerCommand("cordova.simulate.android", () => {
            return selectProject().then(project => {
                return launchSimulateCommand(project.workspaceRoot.uri.fsPath, {
                    dir: project.workspaceRoot.uri.fsPath,
                    target: "chrome",
                    platform: "android",
                    lang: vscode.env.language,
                });
            });
        }),
    );
    EXTENSION_CONTEXT.subscriptions.push(
        vscode.commands.registerCommand("cordova.simulate.ios", () => {
            return selectProject().then(project => {
                return launchSimulateCommand(project.workspaceRoot.uri.fsPath, {
                    dir: project.workspaceRoot.uri.fsPath,
                    target: "chrome",
                    platform: "ios",
                    lang: vscode.env.language,
                });
            });
        }),
    );
}

function commandWrapper(fn, args) {
    return selectProject().then(project => {
        return fn(project.workspaceRoot.uri.fsPath, ...args);
    });
}

/* Launches a simulate command and records telemetry for it */
function launchSimulateCommand(
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

function selectProject(): Promise<CordovaWorkspaceManager> {
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
