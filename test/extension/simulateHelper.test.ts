// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import { SimulateHelper } from "../../src/utils/simulateHelper";
import * as CordovaSimulate from "cordova-simulate";
import { CordovaProjectHelper } from "../../src/utils/cordovaProjectHelper";

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

    suite("subfolderVerification", function () {
        function isSimulateFolderInSubfolder(
            fsPath: string,
            workspaceFolderPath: string,
            simulateOptions: CordovaSimulate.SimulateOptions,
        ): boolean {
            const checkPath = path.join(workspaceFolderPath, ".vscode", "simulate");
            if (fs.existsSync(checkPath)) {
                simulateOptions.dir = workspaceFolderPath;
                if (!simulateOptions.simulationpath) {
                    simulateOptions.simulationpath = checkPath;
                }
                return false;
            } else {
                simulateOptions.dir = fsPath;
                if (!simulateOptions.simulationpath) {
                    simulateOptions.simulationpath = path.join(fsPath, ".vscode", "simulate");
                }
                return true;
            }
        }
        test("should get correct path when cordova project in workspace subfolder", () => {
            let simulateOptions: CordovaSimulate.SimulateOptions = {
                dir: "",
                simulationpath: "",
            };
            const isSubfolder = isSimulateFolderInSubfolder(
                path.resolve(__dirname, "../resources/testSubfolderProject/cordovaProject"),
                path.resolve(__dirname, "../resources/testSubfolderProject"),
                simulateOptions,
            );

            assert.strictEqual(isSubfolder, true);
            assert.strictEqual(
                simulateOptions.dir,
                path.resolve(__dirname, "../resources/testSubfolderProject/cordovaProject"),
            );
            assert.strictEqual(
                simulateOptions.simulationpath,
                path.resolve(
                    __dirname,
                    "../resources/testSubfolderProject/cordovaProject/.vscode/simulate",
                ),
            );

            const platforms = CordovaProjectHelper.getInstalledPlatforms(simulateOptions.dir);
            assert.strictEqual(platforms.length, 3);
        });
    });
});
