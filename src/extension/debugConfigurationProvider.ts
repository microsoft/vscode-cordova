// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { TelemetryHelper } from "../utils/telemetryHelper";
import { Telemetry } from "../utils/telemetry";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export class CordovaDebugConfigProvider implements vscode.DebugConfigurationProvider {
    private debugConfigurations = {
        "Debug Android on emulator": {
            name: "Debug Android on emulator",
            type: "cordova",
            request: "launch",
            platform: "android",
            target: "emulator",
            port: 9222,
            sourceMaps: true,
            cwd: "${workspaceFolder}",
        },
        "Attach to running Android on emulator": {
            name: "Attach to running Android on emulator",
            type: "cordova",
            request: "attach",
            platform: "android",
            target: "emulator",
            port: 9222,
            sourceMaps: true,
            cwd: "${workspaceFolder}",
        },
        "Debug Android on device": {
            name: "Debug Android on device",
            type: "cordova",
            request: "launch",
            platform: "android",
            target: "device",
            port: 9222,
            sourceMaps: true,
            cwd: "${workspaceFolder}",
        },
        "Attach to running Android on device": {
            name: "Attach to running Android on device",
            type: "cordova",
            request: "attach",
            platform: "android",
            target: "device",
            port: 9222,
            sourceMaps: true,
            cwd: "${workspaceFolder}",
        },
        "Debug iOS on device - experimental": {
            name: "Debug iOS on device - experimental",
            type: "cordova",
            request: "launch",
            platform: "ios",
            target: "device",
            port: 9220,
            sourceMaps: true,
            cwd: "${workspaceFolder}",
        },
        "Attach to running iOS on device - experimental": {
            name: "Attach to running iOS on device - experimental",
            type: "cordova",
            request: "attach",
            platform: "ios",
            target: "device",
            port: 9220,
            sourceMaps: true,
            cwd: "${workspaceFolder}",
        },
        "Debug iOS on simulator - experimental": {
            name: "Debug iOS on simulator - experimental",
            type: "cordova",
            request: "launch",
            platform: "ios",
            target: "emulator",
            port: 9220,
            sourceMaps: true,
            cwd: "${workspaceFolder}",
        },
        "Attach to running iOS on simulator - experimental": {
            name: "Attach to running iOS on simulator - experimental",
            type: "cordova",
            request: "attach",
            platform: "ios",
            target: "emulator",
            port: 9220,
            sourceMaps: true,
            cwd: "${workspaceFolder}",
        },
        "Serve to the browser (Ionic Serve)": {
            name: "Serve to the browser (Ionic Serve)",
            type: "cordova",
            request: "launch",
            platform: "serve",
            target: "chrome",
            cwd: "${workspaceFolder}",
            devServerAddress: "localhost",
            sourceMaps: true,
            ionicLiveReload: true,
        },
        "Simulate Android in browser": {
            name: "Simulate Android in browser",
            type: "cordova",
            request: "launch",
            platform: "android",
            target: "chrome",
            simulatePort: 8000,
            livereload: true,
            sourceMaps: true,
            cwd: "${workspaceFolder}",
        },
        "Simulate iOS in browser": {
            name: "Simulate iOS in browser",
            type: "cordova",
            request: "launch",
            platform: "ios",
            target: "chrome",
            simulatePort: 8000,
            livereload: true,
            sourceMaps: true,
            cwd: "${workspaceFolder}",
        },
        "Debug on Browser": {
            name: "Debug on Browser",
            type: "cordova",
            request: "launch",
            platform: "browser",
            target: "chrome",
            simulatePort: 8000,
            livereload: true,
            sourceMaps: true,
            cwd: "${workspaceFolder}",
        },
    };

    private pickConfig: ReadonlyArray<vscode.QuickPickItem> = [
        {
            label: "Debug Android on emulator",
            description: localize(
                "RunAndDebugCordovaAppOnAndroidEmulator",
                "Run and debug Cordova app on Android emulator",
            ),
        },
        {
            label: "Attach to running Android on emulator",
            description: localize(
                "AttachToRunningCordovaAppOnAndroidEmulator",
                "Attach to running Cordova app on Android emulator",
            ),
        },
        {
            label: "Debug Android on device",
            description: localize(
                "RunAndDebugCordovaAppOnAndroidDevice",
                "Run and debug Cordova app on Android device",
            ),
        },
        {
            label: "Attach to running Android on device",
            description: localize(
                "AttachToRunningCordovaAppOnAndroidDevice",
                "Attach to running Cordova app on Android device",
            ),
        },
        {
            label: "Debug iOS on simulator - experimental",
            description: localize(
                "RunAndDebugCordovaAppOniOSSimulator",
                "Run and debug Cordova app on iOS simulator",
            ),
        },
        {
            label: "Attach to running iOS on simulator - experimental",
            description: localize(
                "AttachToRunningCordovaAppOniOSSimulator",
                "Attach to running Cordova app on iOS simulator",
            ),
        },
        {
            label: "Debug iOS on device",
            description: localize(
                "RunAndDebugCordovaAppOniOSDevice",
                "Run and debug Cordova app on iOS device",
            ),
        },
        {
            label: "Attach to running iOS on device",
            description: localize(
                "AttachToRunningCordovaAppOniOSDevice",
                "Attach to running Cordova app on iOS device",
            ),
        },
        {
            label: "Serve to the browser (Ionic Serve)",
            description: localize(
                "ServeToTheBrowser",
                "Serve to the browser (currently supported only for Ionic)",
            ),
        },
        {
            label: "Simulate Android in browser",
            description: localize(
                "SimulateCordovaAndroidAppInBrowser",
                "Simulate Cordova Android application in browser",
            ),
        },
        {
            label: "Simulate iOS in browser",
            description: localize(
                "SimulateCordovaIOSAppInBrowser",
                "Simulate Cordova iOS application in browser",
            ),
        },
        {
            label: "Debug on Browser",
            description: localize(
                "RunAndDebugCordovaAppInBrowser",
                "Run and debug Cordova application in browser",
            ),
        },
    ];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async provideDebugConfigurations(
        folder: vscode.WorkspaceFolder | undefined,
        token?: vscode.CancellationToken,
    ): Promise<vscode.DebugConfiguration[]> {
        return new Promise<vscode.DebugConfiguration[]>(resolve => {
            const configPicker = this.prepareDebugConfigPicker();
            const disposables: vscode.Disposable[] = [];
            const pickHandler = () => {
                const chosenConfigsEvent = TelemetryHelper.createTelemetryEvent(
                    "chosenDebugConfigurations",
                );
                const selected: string[] = configPicker.selectedItems.map(element => element.label);
                chosenConfigsEvent.properties.selectedItems = selected;
                Telemetry.send(chosenConfigsEvent);
                const launchConfig = this.gatherDebugScenarios(selected);
                disposables.forEach(d => d.dispose());
                resolve(launchConfig);
            };

            disposables.push(
                configPicker.onDidAccept(pickHandler),
                configPicker.onDidHide(pickHandler),
                configPicker,
            );

            configPicker.show();
        });
    }

    private gatherDebugScenarios(selectedItems: string[]): vscode.DebugConfiguration[] {
        const launchConfig: vscode.DebugConfiguration[] = selectedItems.map(
            element => this.debugConfigurations[element],
        );
        return launchConfig;
    }

    private prepareDebugConfigPicker(): vscode.QuickPick<vscode.QuickPickItem> {
        const debugConfigPicker = vscode.window.createQuickPick();
        debugConfigPicker.canSelectMany = true;
        debugConfigPicker.ignoreFocusOut = true;
        debugConfigPicker.title = localize("PickDebugConfigurations", "Pick debug configurations");
        debugConfigPicker.items = this.pickConfig;
        debugConfigPicker.selectedItems = [this.pickConfig[0]]; // the scenario "Debug Android on emulator" is selected by default
        return debugConfigPicker;
    }
}
