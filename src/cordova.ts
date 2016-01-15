// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as fs from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';
import * as vscode from 'vscode';

import {TsdHelper} from './utils/tsdHelper';
import {CordovaProjectHelper} from './utils/cordovaProjectHelper';
import {CordovaCommandHelper} from './utils/CordovaCommandHelper';

let PLUGIN_TYPE_DEFS_FILENAME =  "pluginTypings.json";
let PLUGIN_TYPE_DEFS_PATH =  path.resolve(__dirname, "..", "..", PLUGIN_TYPE_DEFS_FILENAME);
let TSD_SETTINGS_JSON_FILE =  "tsd.json";
let EXTENSION_SRC_FOLDERNAME =  "src";
let CORDOVA_TYPINGS_QUERYSTRING =  "cordova";

export function activate(context: vscode.ExtensionContext): void {
    // Get the project root and check if it is a Cordova project
    let cordovaProjectRoot = CordovaProjectHelper.getCordovaProjectRoot(vscode.workspace.rootPath);

    if (!cordovaProjectRoot) {
        return;
    }

    // We need to update the type definitions added to the project
    // as and when plugins are added or removed. For this reason,
    // setup a file system watcher to watch changes to plugins in the Cordova project
    // Note that watching plugins/fetch.json file would suffice

    let watcher = vscode.workspace.createFileSystemWatcher('**/plugins/fetch.json', false /*ignoreCreateEvents*/, false /*ignoreChangeEvents*/, false /*ignoreDeleteEvents*/);

    watcher.onDidChange((e: vscode.Uri) => updatePluginTypeDefinitions(cordovaProjectRoot));
    watcher.onDidDelete((e: vscode.Uri) => updatePluginTypeDefinitions(cordovaProjectRoot));
    watcher.onDidCreate((e: vscode.Uri) => updatePluginTypeDefinitions(cordovaProjectRoot));

    context.subscriptions.push(watcher);

    // Register Cordova commands
    context.subscriptions.push(vscode.commands.registerCommand('cordova.build',
        () => CordovaCommandHelper.executeCordovaCommand(cordovaProjectRoot, "build")));
    context.subscriptions.push(vscode.commands.registerCommand('cordova.run',
        () => CordovaCommandHelper.executeCordovaCommand(cordovaProjectRoot, "run")));

    let tsdJsonPath = getTsdSettingsFilePath(cordovaProjectRoot);

    // Install the type defintion files for Cordova
    TsdHelper.installTypings(tsdJsonPath, [CORDOVA_TYPINGS_QUERYSTRING]);

    // Install type definition files for the currently installed plugins
    updatePluginTypeDefinitions(cordovaProjectRoot);

}

export function deactivate(context: vscode.ExtensionContext): void {
    console.log("Extension has been deactivated");
}

function getTsdSettingsFilePath(cordovaProjectRoot: string): string {
    // Create the ".vscode" temp folder at the project root that will house the type definition files
    let tsdJsonSrcPath = path.resolve(__dirname, "..", "..", EXTENSION_SRC_FOLDERNAME, TSD_SETTINGS_JSON_FILE);
    let tsdJsonDestPath = CordovaProjectHelper.getTsdJsonPath(cordovaProjectRoot);

    // Copy tsd.json only if the project does not have one already
    if (CordovaProjectHelper.existsSync(tsdJsonSrcPath) && !CordovaProjectHelper.existsSync(tsdJsonDestPath)) {
        let tsdJsonContents = fs.readFileSync(tsdJsonSrcPath).toString();
        fs.writeFileSync(tsdJsonDestPath, tsdJsonContents);
    }

    if (CordovaProjectHelper.existsSync(tsdJsonDestPath)) {
        return tsdJsonDestPath;
    }

    return null;
}

function getPluginTypingsJson() : any {
    if (CordovaProjectHelper.existsSync(PLUGIN_TYPE_DEFS_PATH)) {
        return require(PLUGIN_TYPE_DEFS_PATH);
    }

    console.error("Cordova plugin type declaration mapping file \"pluginTypings.json\" is missing from the extension folder.");
    return null;
}

function getNewTypeDefinitions(installedPlugins: string[]): string[] {
    let newTypeDefs: string[] = [];
    let pluginTypings = getPluginTypingsJson();
    if (!pluginTypings) {
        return;
    }

    return installedPlugins.filter(pluginName => !!pluginTypings[pluginName])
    .map(pluginName => pluginTypings[pluginName].typingFile);
}

function addPluginTypeDefinitions(installedPlugins: string[], currentTypeDefs: string[], tsdPath: string): void {
    let pluginTypings = getPluginTypingsJson();
    if (!pluginTypings) {
        return;
    }

    let typingsToAdd = installedPlugins.filter((pluginName: string) => {
        if (pluginTypings[pluginName]) {
            return currentTypeDefs.indexOf(pluginTypings[pluginName].typingFile) < 0;
        }

        return false;
    }).map((pluginName: string) => {
        return pluginTypings[pluginName].queryString;
    });

    TsdHelper.installTypings(tsdPath, typingsToAdd);
}

function removePluginTypeDefinitions(projectRoot: string, currentTypeDefs: string[], newTypeDefs: string[]): void {
    // Find the type definition files that need to be removed
    currentTypeDefs.forEach((typeDef: string) => {
        if (newTypeDefs.indexOf(typeDef) < 0) {
            var fileToDelete = path.resolve(CordovaProjectHelper.getCordovaPluginTypeDefsPath(projectRoot), typeDef);
            rimraf(fileToDelete, (err: Error) => {
                if (err) {
                    // Debug-only message
                    console.log("Failed to delete file " + fileToDelete);
                }
            });
        }
    });
}

function updatePluginTypeDefinitions(cordovaProjectRoot: string): void {
    let installedPlugins: string[] = CordovaProjectHelper.getInstalledPlugins(cordovaProjectRoot);
    let newTypeDefs = getNewTypeDefinitions(installedPlugins);
    let typeDefsFolder = CordovaProjectHelper.getCordovaPluginTypeDefsPath(cordovaProjectRoot);

    if (!CordovaProjectHelper.existsSync(typeDefsFolder)) {
        addPluginTypeDefinitions(installedPlugins, [], CordovaProjectHelper.getTsdJsonPath(cordovaProjectRoot));
        return;
    }

    fs.readdir(typeDefsFolder, (err: Error, currentTypeDefs: string[]) => {
        if (err) {
            return;
        }

        addPluginTypeDefinitions(installedPlugins, currentTypeDefs, CordovaProjectHelper.getTsdJsonPath(cordovaProjectRoot));
        removePluginTypeDefinitions(cordovaProjectRoot, currentTypeDefs, newTypeDefs);
    });
}