/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

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
    let vsCodeDir = path.resolve(testProjectPath, ".vscode");
    let cordovaTypeDef: string = CordovaProjectHelper.getCordovaTypeDefsPath(testProjectPath);

    suiteTeardown(() => {
        // Cleanup the target folder for type definitions
        if (fs.existsSync(vsCodeDir)) {
            rimraf.sync(vsCodeDir);
        }
    });

    function checkTypeDefinitions(expectedTypedDefs: string[])
    {
        let actualTypeDefs = testUtils.enumerateListOfTypeDefinitions(testProjectPath);
        assert.deepEqual(actualTypeDefs, expectedTypedDefs);
    };

    test('Plugin type definitions are installed on activation', () => {
        return Q.delay(10000).then(() => {
            checkTypeDefinitions(["Camera.d.ts"]);
        });
    });

    test('Plugin type defintion for a plugin is added upon adding that plugin', () => {
        return testUtils.addCordovaComponents("plugin", testProjectPath, ["cordova-plugin-device"])
        .then(() => {
            return Q.delay(10000);
        }).then(() => {
            checkTypeDefinitions(["Camera.d.ts", "Device.d.ts"]);
        });
    });

    test('Plugin type definition for a plugin is removed after removal of that plugin', () => {
        return testUtils.removeCordovaComponents("plugin", testProjectPath, ["cordova-plugin-device"])
        .then(() => {
            return Q.delay(10000);
        }).then(() => {
             checkTypeDefinitions(["Camera.d.ts"]);
        });
    });

    test('Verify that the commands registered by Cordova extension are loaded', () => {
        return vscode.commands.getCommands(true)
        .then((results) => {
            let cordovaCmdsAvailable = results.filter((commandName: string) => {
                return commandName.indexOf("cordova.") > -1
            });
            assert.deepEqual(cordovaCmdsAvailable, ["cordova.build", "cordova.run", "cordova.runDevice", "cordova.emulate"])
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
            assert.ok(fs.existsSync(appxPackagesParentPath));
            return testUtils.removeCordovaComponents("platform", testProjectPath, ["windows"])
        });
    });
});
