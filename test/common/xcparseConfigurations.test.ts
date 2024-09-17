// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as assert from "assert";
import * as path from "path";
import { XCParseConfiguration } from "../../src/common/xcparseConfiguration";

suite("xcparseConfigurationHelper", function () {
    test("should get pbxproj file content correctly", (done: Mocha.Done) => {
        const testPbxprojFilePath = path.resolve(
            __dirname,
            "../resources/testPbxprojFile/project.pbxproj",
        );
        const pbxprojContent = XCParseConfiguration.getPbxprojFileContent(testPbxprojFilePath);
        assert.ok("archiveVersion" in pbxprojContent);
        assert.ok("classes" in pbxprojContent);
        assert.ok("objectVersion" in pbxprojContent);
        assert.ok("objects" in pbxprojContent);
        assert.ok("rootObject" in pbxprojContent);
        done();
    });

    test("should get PBXNativeTarget correctly", (done: Mocha.Done) => {
        const testPbxprojFilePath = path.resolve(
            __dirname,
            "../resources/testPbxprojFile/project.pbxproj",
        );
        const pbxprojContent = XCParseConfiguration.getPbxprojFileContent(testPbxprojFilePath);
        const nativeTarget = XCParseConfiguration.getPBXNativeTarget(pbxprojContent);
        assert.strictEqual(nativeTarget.isa, "PBXNativeTarget");
        done();
    });
});
