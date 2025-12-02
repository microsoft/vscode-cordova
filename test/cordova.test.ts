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
                "cordova.networkView",
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
        test.skip("Verify that the simulate command launches the simulate server", async () => {
            // Remove the explicit Cordova Android version after a release of the 'cordova-serve' package
            // with the fix for the issue https://github.com/apache/cordova-serve/issues/43
            // SKIPPED: This test requires browser launch which is unreliable in headless CI environments
            try {
                await testUtils.addCordovaComponents("platform", testProjectPath, [
                    "android@9.1.0",
                ]);
                console.log("Platform added successfully");

                await vscode.commands.executeCommand("cordova.simulate.android");
                console.log("Simulate command executed");

                // Give the server a moment to start before checking
                await new Promise(resolve => setTimeout(resolve, 3000));

                const simHostStarted = await testUtils.isUrlReachableWithRetry(
                    "http://localhost:8000/simulator/index.html",
                    120000,
                    1500,
                );
                console.log(`Sim host reachable: ${simHostStarted}`);
                assert(simHostStarted, "The simulation host is not running.");

                const appHostStarted = await testUtils.isUrlReachableWithRetry(
                    "http://localhost:8000/index.html",
                    120000,
                    1500,
                );
                console.log(`App host reachable: ${appHostStarted}`);
                assert(appHostStarted, "The application host is not running.");
            } finally {
                await testUtils.removeCordovaComponents("platform", testProjectPath, ["android"]);
            }
        });
    });
});
