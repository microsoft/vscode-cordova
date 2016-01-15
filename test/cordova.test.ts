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
    let cordovaTypeDefDir: string = CordovaProjectHelper.getCordovaTypeDefsPath(testProjectPath);

    suiteTeardown(() => {
        // Cleanup the target folder for type definitions
        if (CordovaProjectHelper.existsSync(cordovaTypeDefDir)) {
            rimraf.sync(cordovaTypeDefDir);
        }

        // Remove the FileSystem and whitelist plugins from the testProject
        return testUtils.removeCordovaComponents("plugin", testProjectPath, ["cordova-plugin-file", "cordova-plugin-whitelist"])
    });

    function checkTypeDefinitions(expectedTypedDefs: string[])
    {
        let actualTypeDefs = testUtils.enumerateListOfTypeDefinitions(testProjectPath);
        assert.deepEqual(actualTypeDefs, expectedTypedDefs);
    };

    test('Plugin type definitions are installed on activation', () => {
        return Q.delay(10000).then(() => {
            checkTypeDefinitions(["FileSystem.d.ts"]);
        });
    });

    test('Plugin type defintion for a plugin is added upon adding that plugin', () => {
        return testUtils.addCordovaComponents("plugin", testProjectPath, ["cordova-plugin-device"])
        .then(() => {
            return Q.delay(10000);
        }).then(() => {
            checkTypeDefinitions(["Device.d.ts", "FileSystem.d.ts"]);
        });
    });

    test('Plugin type definition for a plugin is removed after removal of that plugin', () => {
        return testUtils.removeCordovaComponents("plugin", testProjectPath, ["cordova-plugin-device"])
        .then(() => {
            return Q.delay(10000);
        }).then(() => {
             checkTypeDefinitions(["FileSystem.d.ts"]);
        });
    });

    test('Verify that the commands registered by Cordova extension are loaded', () => {
        return vscode.commands.getCommands(true)
        .then((results) => {
            let cordovaCmdsAvailable = results.filter((commandName: string) => {
                return commandName.indexOf("cordova.") > -1
            });
            assert.deepEqual(cordovaCmdsAvailable, ["cordova.build", "cordova.run"])
        });
    });

    test('Execute Commands from the command palette', () => {
        return testUtils.addCordovaComponents("platform", testProjectPath, ["windows"])
        .then(() => {
            return vscode.commands.executeCommand("cordova.build");
        }).then(() => {
            return Q.delay(10000);
        }).then(res => {
            let appxPackagesParentPath = path.resolve(testProjectPath, "platforms", "windows", "AppPackages");
            assert.ok(CordovaProjectHelper.existsSync(appxPackagesParentPath));
            return testUtils.removeCordovaComponents("platform", testProjectPath, ["windows"])
        });
    });
});
