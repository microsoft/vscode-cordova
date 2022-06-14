// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as assert from "assert";
import { findFileInFolderHierarchy } from "../../src/utils/extensionHelper";

suite("extensionHelper", function () {
    const testProjectPath = path.join(__dirname, "..", "resources", "testCordovaProject");

    suite("findFileInFolderHierarchy", function () {
        test("should find the required folder and return path to it", () => {
            const testingDirectory = path.join(testProjectPath, "www", "js");
            const indexJsFilePath = path.join(testingDirectory, "index.js");
            const configXmlFilePath = path.join(testProjectPath, "config.xml");

            assert.strictEqual(
                findFileInFolderHierarchy(testingDirectory, "index.js"),
                indexJsFilePath,
            );
            assert.strictEqual(
                findFileInFolderHierarchy(testingDirectory, "config.xml"),
                configXmlFilePath,
            );
        });
        test("should not find a nonexistent required folder and should return 'null'", () => {
            assert.strictEqual(
                findFileInFolderHierarchy(testProjectPath, "testFileHierarchy.js"),
                null,
            );
        });
    });
});
