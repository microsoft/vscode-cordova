// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import { CordovaProjectHelper } from "../../src/utils/cordovaProjectHelper";
import * as assert from "assert";

suite("сordovaProjectHelper", function () {
    const testProjectPath = path.join(__dirname, "..", "resources", "testCordovaProject");

    suite("isCordovaProject", function () {
        test("should return 'true' in case 'config.xml' is in a workspace root folder", () => {
            const isCordovaProject = CordovaProjectHelper.isCordovaProject(testProjectPath);
            assert.strictEqual(isCordovaProject, true);
        });
        test("should return 'false' in case there is no the 'config.xml' file in folder hierarchy ", () => {
            const isCordovaProject = CordovaProjectHelper.isCordovaProject(path.join(testProjectPath, ".."));
            assert.strictEqual(isCordovaProject, false);
        });
    });
});
