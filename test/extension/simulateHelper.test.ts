// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as assert from "assert";
import { SimulateHelper } from "../../src/utils/simulateHelper";

suite("simulateHelper", function () {
    suite("isSimulateTarget", function () {
        test("should find a target in Simulate targets", () => {
            assert.strictEqual(SimulateHelper.isSimulateTarget("default"), true);
            assert.strictEqual(SimulateHelper.isSimulateTarget("chrome"), true);
            assert.strictEqual(SimulateHelper.isSimulateTarget("chromium"), true);
            assert.strictEqual(SimulateHelper.isSimulateTarget("edge"), true);
            assert.strictEqual(SimulateHelper.isSimulateTarget("firefox"), true);
            assert.strictEqual(SimulateHelper.isSimulateTarget("ie"), true);
            assert.strictEqual(SimulateHelper.isSimulateTarget("opera"), true);
            assert.strictEqual(SimulateHelper.isSimulateTarget("safari"), true);
        });
        test("shouldn't find a target in Simulate targets", () => {
            assert.strictEqual(SimulateHelper.isSimulateTarget("test"), false);
            assert.strictEqual(SimulateHelper.isSimulateTarget("browser"), false);
        });
    });
});
