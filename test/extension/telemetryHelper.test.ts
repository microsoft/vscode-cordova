// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import Sinon = require("sinon");
import { TelemetryHelper } from "../../src/utils/telemetryHelper";
import { CordovaProjectHelper } from "../../src/utils/cordovaProjectHelper";

suite("telemetryHelper", function () {
    const testProjectPath = path.join(__dirname, "..", "resources", "testCordovaProject");

    suite("determineProjectTypes", function () {
        test("should detect Ionic project", async () => {
            const ionicProjectPath = path.join(__dirname, "..", "resources", "testIonicProject");

            Sinon.stub(fs, "existsSync").callsFake(
                (p: string) => p === path.join(ionicProjectPath, "package.json"),
            );
            Sinon.stub(fs, "readFileSync").callsFake(
                (path: string, options?: string | { encoding?: string; flag?: string }) => {
                    return JSON.stringify({
                        dependencies: { "@ionic/angular": "5.0.0" },
                        devDependencies: { "@ionic-native/core": "5.0.0" },
                    });
                },
            );

            try {
                const projectType = await TelemetryHelper.determineProjectTypes(ionicProjectPath);
                assert.strictEqual(projectType.ionicMajorVersion, 5);
            } finally {
                (fs.readFileSync as any).restore();
                (fs.existsSync as any).restore();
            }
        });

        suite("not Ionic projects", function () {
            teardown(() => {
                (CordovaProjectHelper.exists as any).restore();
            });

            test("should detect Cordova and Meteor project", async () => {
                Sinon.stub(CordovaProjectHelper, "exists").callsFake(
                    (filename: string): Promise<boolean> => {
                        return Promise.resolve(
                            filename.toString().includes(".meteor") ||
                                filename.toString().includes("config.xml"),
                        );
                    },
                );

                const projectType = await TelemetryHelper.determineProjectTypes(testProjectPath);
                assert.ok(projectType.isCordova && projectType.isMeteor);
            });
        });
    });
});
