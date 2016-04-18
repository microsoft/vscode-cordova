// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as Q from 'q';
import * as rimraf from 'rimraf';
import * as vscode from 'vscode';

import * as testUtils from './testUtils';
import {CordovaCommandHelper} from './../src/utils/CordovaCommandHelper';
import {CordovaProjectHelper} from './../src/utils/CordovaProjectHelper';

suite("VSCode Cordova extension - intellisense and command palette tests", () => {
    let testProjectPath: string = path.resolve(__dirname, "..", "..", "test", "testProject");
    let cordovaTypeDefDir: string = CordovaProjectHelper.getOrCreateTypingsTargetPath(testProjectPath);

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
    };

    test('#Plugin type definitions are installed on activation', () => {
        return Q.delay(10000).then(() => {
            checkTypeDefinitions(["FileSystem.d.ts"]);
        });
    });

    test('#Plugin type defintion for a plugin is added upon adding that plugin', () => {
        return testUtils.addCordovaComponents("plugin", testProjectPath, ["cordova-plugin-device"])
            .then(() => {
                return Q.delay(10000);
            }).then(() => {
                checkTypeDefinitions(["Device.d.ts", "FileSystem.d.ts"]);
            });
    });

    test('#Plugin type definition for a plugin is removed after removal of that plugin', () => {
        return testUtils.removeCordovaComponents("plugin", testProjectPath, ["cordova-plugin-device"])
            .then(() => {
                return Q.delay(10000);
            }).then(() => {
                checkTypeDefinitions(["FileSystem.d.ts"]);
            });
    });

    test('#Verify that the commands registered by Cordova extension are loaded', () => {
        return vscode.commands.getCommands(true)
            .then((results) => {
                let cordovaCmdsAvailable = results.filter((commandName: string) => {
                    return commandName.indexOf("cordova.") > -1
                });
                assert.deepEqual(cordovaCmdsAvailable, ["cordova.prepare", "cordova.build", "cordova.run", "cordova.simulate"])
            });
    });

    test('#Execute Commands from the command palette', () => {
        return testUtils.addCordovaComponents("platform", testProjectPath, ["android"])
            .then(() => {
                return vscode.commands.executeCommand("cordova.build");
            }).then(() => {
                return Q.delay(10000);
            }).then(res => {
                let androidBuildPath = path.resolve(testProjectPath, "platforms", "android", "build");
                assert.ok(CordovaProjectHelper.existsSync(androidBuildPath));
                return testUtils.removeCordovaComponents("platform", testProjectPath, ["android"])
            });
    });

    test('#Verify that the simulate command launches the simulate server', () => {
        return testUtils.addCordovaComponents("platform", testProjectPath, ["browser"])
            .then(() => {
                return vscode.commands.executeCommand("cordova.simulate");
            }).then(() => {
                return Q.delay(10000);
            }).then(() => {
                return testUtils.isUrlReachable('http://localhost:8000/simulator/index.html');
            }).then((serverStarted: boolean) => {
                assert.equal(serverStarted, true, "The simulate server is running.");
            }).then(() => {
                return testUtils.removeCordovaComponents("platform", testProjectPath, ["browser"]);
            });
    });
});
