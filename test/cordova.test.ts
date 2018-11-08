// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as assert from "assert";
import * as path from "path";
import * as Q from "q";
import * as rimraf from "rimraf";
import * as vscode from "vscode";

import * as testUtils from "./testUtils";
import {CordovaProjectHelper} from "../src/utils/cordovaProjectHelper";

suite("VSCode Cordova extension - intellisense and command palette tests", () => {
    let testProjectPath: string = path.resolve(__dirname, "..", "..", "test", "testProject");
    let cordovaTypeDefDir: string = CordovaProjectHelper.getOrCreateTypingsTargetPath(testProjectPath);

    suiteSetup(() => {
        return testUtils.addCordovaComponents("plugin", testProjectPath, ["cordova-plugin-file"]);
    });
    suiteTeardown(() => {
        // Cleanup the target folder for type definitions
        if (CordovaProjectHelper.existsSync(cordovaTypeDefDir)) {
            rimraf.sync(cordovaTypeDefDir);
        }

        // Remove the FileSystem and whitelist plugins from the testProject
        return testUtils.removeCordovaComponents("plugin", testProjectPath, ["cordova-plugin-file", "cordova-plugin-whitelist"]);
    });

    function checkTypeDefinitions(expectedTypedDefs: string[]) {
        let actualTypeDefs = testUtils.enumerateListOfTypeDefinitions(testProjectPath);
        assert.deepEqual(actualTypeDefs, expectedTypedDefs);
    }

    test("#Plugin type definitions are installed on activation", () => {
        return Q.delay(15000).then(() => {
            checkTypeDefinitions(["FileSystem.d.ts"]);
        });
    });

    test("#Plugin type defintion for a plugin is added upon adding that plugin", () => {
        return testUtils.addCordovaComponents("plugin", testProjectPath, ["cordova-plugin-device"])
            .delay(30000)
            .then(() => {
                checkTypeDefinitions(["Device.d.ts", "FileSystem.d.ts"]);
            });
    });

    test("#Plugin type definition for a plugin is removed after removal of that plugin", () => {
        return testUtils.removeCordovaComponents("plugin", testProjectPath, ["cordova-plugin-device"])
            .delay(15000)
            .then(() => {
                checkTypeDefinitions(["FileSystem.d.ts"]);
            });
    });

    test("#Verify that the commands registered by Cordova extension are loaded", () => {
        return vscode.commands.getCommands(true)
            .then((results) => {
                let cordovaCmdsAvailable = results.filter((commandName: string) => {
                    return commandName.indexOf("cordova.") > -1;
                });
                assert.deepEqual(cordovaCmdsAvailable, ["cordova.prepare", "cordova.build", "cordova.run", "cordova.simulate.android", "cordova.simulate.ios"]);
            });
    });

    // test("#Execute Commands from the command palette", () => {
    //     return testUtils.addCordovaComponents("platform", testProjectPath, ["android"])
    //         .then(() => vscode.commands.executeCommand("cordova.build"))
    //         .delay(30000)
    //         .then(res => {
    //             let androidBuildPath = path.resolve(testProjectPath, "platforms", "android", "build");
    //             assert.ok(CordovaProjectHelper.existsSync(androidBuildPath));
    //             return testUtils.removeCordovaComponents("platform", testProjectPath, ["android"]);
    //         });
    // });

    test("#Verify that the simulate command launches the simulate server", () => {
        return testUtils.addCordovaComponents("platform", testProjectPath, ["android"])
            .delay(30000)
            .then(() => vscode.commands.executeCommand("cordova.simulate.android"))
            .then(() => testUtils.isUrlReachable("http://localhost:8000/simulator/index.html"))
            .then((simHostStarted: boolean) => assert(simHostStarted, "The simulation host is running."))
            .then(() => testUtils.isUrlReachable("http://localhost:8000/index.html"))
            .then((appHostStarted: boolean) => assert(appHostStarted, "The application host is running."))
            .fin(() => testUtils.removeCordovaComponents("platform", testProjectPath, ["android"]));
    });
});
