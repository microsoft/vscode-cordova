// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";

export class CordovaDebugConfigProvider implements vscode.DebugConfigurationProvider {
    private debugConfigurations = {
        "Run Android on device": {
            "name": "Run Android on device",
            "type": "cordova",
            "request": "launch",
            "platform": "android",
            "target": "device",
            "port": 9222,
            "sourceMaps": true,
            "cwd": "${workspaceFolder}",
        },
        "Run iOS on device": {
            "name": "Run iOS on device",
            "type": "cordova",
            "request": "launch",
            "platform": "ios",
            "target": "device",
            "port": 9220,
            "sourceMaps": true,
            "cwd": "${workspaceFolder}",
        },
        "Attach to running Android on device": {
            "name": "Attach to running Android on device",
            "type": "cordova",
            "request": "attach",
            "platform": "android",
            "target": "device",
            "port": 9222,
            "sourceMaps": true,
            "cwd": "${workspaceFolder}",
        },
        "Attach to running iOS on device": {
            "name": "Attach to running iOS on device",
            "type": "cordova",
            "request": "attach",
            "platform": "ios",
            "target": "device",
            "port": 9220,
            "sourceMaps": true,
            "cwd": "${workspaceFolder}",
        },
        "Run Android on emulator": {
            "name": "Run Android on emulator",
            "type": "cordova",
            "request": "launch",
            "platform": "android",
            "target": "emulator",
            "port": 9222,
            "sourceMaps": true,
            "cwd": "${workspaceFolder}",
        },
        "Attach to running Android on emulator": {
            "name": "Attach to running Android on emulator",
            "type": "cordova",
            "request": "attach",
            "platform": "android",
            "target": "emulator",
            "port": 9222,
            "sourceMaps": true,
            "cwd": "${workspaceFolder}",
        },
        "Serve to the browser (ionic serve)": {
            "name": "Serve to the browser (ionic serve)",
            "type": "cordova",
            "request": "launch",
            "platform": "serve",
            "target": "chrome",
            "cwd": "${workspaceFolder}",
            "devServerAddress": "localhost",
            "sourceMaps": true,
            "ionicLiveReload": true,
        },
        "Simulate Android in browser": {
            "name": "Simulate Android in browser",
            "type": "cordova",
            "request": "launch",
            "platform": "android",
            "target": "chrome",
            "simulatePort": 8000,
            "livereload": true,
            "sourceMaps": true,
            "cwd": "${workspaceFolder}",
        },
        "Simulate iOS in browser": {
            "name": "Simulate iOS in browser",
            "type": "cordova",
            "request": "launch",
            "platform": "ios",
            "target": "chrome",
            "simulatePort": 8000,
            "livereload": true,
            "sourceMaps": true,
            "cwd": "${workspaceFolder}",
        },
        "Run Browser": {
            "name": "Run Browser",
            "type": "cordova",
            "request": "launch",
            "platform": "browser",
            "target": "chrome",
            "simulatePort": 8000,
            "livereload": true,
            "sourceMaps": true,
            "cwd": "${workspaceFolder}",
        },
    };

    private pickConfig: ReadonlyArray<vscode.QuickPickItem> = [
        {
            label: "Run Android on device",
            description: "Run and debug Cordova app on Android device",
        },
        {
            label: "Run iOS on device",
            description: "Run and debug Cordova app on iOS device",
        },
        {
            label: "Attach to running Android on device",
            description: "Attach to running Cordova app on Android device",
        },
        {
            label: "Attach to running iOS on device",
            description: "Attach to running Cordova app on iOS device",
        },
        {
            label: "Run Android on emulator",
            description: "Run and debug Cordova app on Android emulator",
        },
        {
            label: "Attach to running Android on emulator",
            description: "Attach to running Cordova app on Android emulator",
        },
        {
            label: "Serve to the browser (ionic serve)",
            description: "Serve to the browser (currently supported only for Ionic)",
        },
        {
            label: "Simulate Android in browser",
            description: "Simulate Cordova Android application in browser",
        },
        {
            label: "Simulate iOS in browser",
            description: "Simulate Cordova iOS application in browser",
        },
        {
            label: "Run Browser",
            description: "Run and debug Cordova application in browser",
        },
    ];

    public async provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken): Promise<vscode.DebugConfiguration[]> {
        return new Promise<vscode.DebugConfiguration[]>((resolve) => {
            const configPicker = this.prepareDebugConfigPicker();
            const disposables: vscode.Disposable[] = [];
            const pickHandler = () => {
                let selected: string[] = configPicker.selectedItems.map(element => element.label);
                const launchConfig = this.gatherDebugScenarios(selected);
                disposables.forEach(d => d.dispose());
                resolve(launchConfig);
            };

            disposables.push(
                configPicker.onDidAccept(pickHandler),
                configPicker.onDidHide(pickHandler),
                configPicker
            );

            configPicker.show();
        });
    }

    private gatherDebugScenarios(selectedItems: string[]): vscode.DebugConfiguration[] {
        let launchConfig: vscode.DebugConfiguration[] = selectedItems.map(element => this.debugConfigurations[element]);
        return launchConfig;
    }

    private prepareDebugConfigPicker(): vscode.QuickPick<vscode.QuickPickItem> {
        const debugConfigPicker = vscode.window.createQuickPick();
        debugConfigPicker.canSelectMany = true;
        debugConfigPicker.ignoreFocusOut = true;
        debugConfigPicker.title = "Pick debug configurations";
        debugConfigPicker.items = this.pickConfig;
        debugConfigPicker.selectedItems = [this.pickConfig[4]];
        return debugConfigPicker;
    }
}
