// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { ConfigurationHelper } from "../../src/common/configurationHelper";

suite("configurationHelper", function () {
    test("should get AndroidInsecureFileMode value correctly", (done: Mocha.Done) => {
        const disableXmlContentPath = path.resolve(
            __dirname,
            "../resources/testAndroidFileModeProject/disableFileModeConfig.xml",
        );
        const disableXmlContent = fs.readFileSync(disableXmlContentPath, "utf-8");
        const disableStatus =
            ConfigurationHelper.getAndroidInsecureFileModeStatus(disableXmlContent);
        assert.strictEqual(disableStatus, true);

        const enableXmlContentPath = path.resolve(
            __dirname,
            "../resources/testAndroidFileModeProject/enableFileModeConfig.xml",
        );
        const enableXmlContent = fs.readFileSync(enableXmlContentPath, "utf-8");
        const enableStatus = ConfigurationHelper.getAndroidInsecureFileModeStatus(enableXmlContent);
        assert.strictEqual(enableStatus, false);
        done();
    });
});
