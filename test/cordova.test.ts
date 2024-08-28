// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as assert from "assert";
import * as path from "path";
import * as rimraf from "rimraf";
import * as vscode from "vscode";
import { delay } from "../src/utils/extensionHelper";
import { CordovaProjectHelper } from "../src/utils/cordovaProjectHelper";
import * as testUtils from "./testUtils";

suite("extensionContext", () => {
    const testProjectPath: string = path.resolve(__dirname, "resources", "testCordovaProject");
    const cordovaTypeDefDir: string =
        CordovaProjectHelper.getOrCreateTypingsTargetPath(testProjectPath);

    suiteTeardown(() => {
        // Cleanup the target folder for type definitions
        if (CordovaProjectHelper.existsSync(cordovaTypeDefDir)) {
            rimraf.sync(cordovaTypeDefDir);
        }
    });

    test("Verify that the commands registered by Cordova extension are loaded", () => {
        return vscode.commands.getCommands(true).then(results => {
            const cordovaCommandsAvailable = results.filter((commandName: string) => {
                return commandName.includes("cordova.");
            });
            assert.deepStrictEqual(cordovaCommandsAvailable, [
                "cordova.restart",
                "cordova.run",
                "cordova.build",
                "cordova.prepare",
                "cordova.requirements",
                "cordova.simulate.android",
                "cordova.simulate.ios",
                "cordova.clean",
                "cordova.telemetry",
            ]);
        });
    });

    suite("smokeTestsContext", () => {
        test("Execute Commands from the command palette", () => {
            // Remove the explicit Cordova Android version after a release of the 'cordova-serve' package
            // with the fix for the issue https://github.com/apache/cordova-serve/issues/43
            return testUtils
                .addCordovaComponents("platform", testProjectPath, ["android@9.1.0"])
                .then(() => {
                    return vscode.commands.executeCommand("cordova.build");
                })
                .then(() => {
                    return delay(10000);
                })
                .then(_res => {
                    const androidBuildPath = path.resolve(
                        testProjectPath,
                        "platforms",
                        "android",
                        "app",
                        "build",
                    );
                    assert.ok(CordovaProjectHelper.existsSync(androidBuildPath));
                    return testUtils.removeCordovaComponents("platform", testProjectPath, [
                        "android",
                    ]);
                });
        });
    });

    suite("CordovaSimulateContext", () => {
        test("Verify that the simulate command launches the simulate server", () => {
            // Remove the explicit Cordova Android version after a release of the 'cordova-serve' package
            // with the fix for the issue https://github.com/apache/cordova-serve/issues/43
            return testUtils
                .addCordovaComponents("platform", testProjectPath, ["android@9.1.0"])
                .then(() => vscode.commands.executeCommand("cordova.simulate.android"))
                .then(() => testUtils.isUrlReachable("http://localhost:8000/simulator/index.html"))
                .then((simHostStarted: boolean) =>
                    assert(simHostStarted, "The simulation host is running."),
                )
                .then(() => testUtils.isUrlReachable("http://localhost:8000/index.html"))
                .then((appHostStarted: boolean) =>
                    assert(appHostStarted, "The application host is running."),
                )
                .finally(() =>
                    testUtils.removeCordovaComponents("platform", testProjectPath, ["android"]),
                );
        });
    });
});
