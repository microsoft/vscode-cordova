// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as fs from "fs";
import * as sinon from "sinon";
import { CordovaProjectHelper, IIonicVersion } from "../../src/utils/cordovaProjectHelper";
import * as assert from "assert";

suite("сordovaProjectHelper", function () {
    const testProjectPath = path.join(__dirname, "..", "resources", "testCordovaProject");

    suite("isCordovaProject", function () {
        test("should return 'true' in case 'config.xml' is in a workspace root folder", () => {
            const isCordovaProject = CordovaProjectHelper.isCordovaProject(testProjectPath);
            assert.strictEqual(isCordovaProject, true);
        });
        test("should return 'false' in case there is no the 'config.xml' file in folder hierarchy", () => {
            const isCordovaProject = CordovaProjectHelper.isCordovaProject(path.join(testProjectPath, ".."));
            assert.strictEqual(isCordovaProject, false);
        });
    });

    suite("checkIonicVersions", function () {
        const ionicProjectPath = path.join(__dirname, "..", "resources", "testIonicProject");
        const ionicPackageJsonFileLocation = path.join(ionicProjectPath, "package.json");

        teardown(() => {
             // restore individual methods
            (fs.existsSync as any).restore();
            (fs.readFileSync as any).restore();
        });

        function checkIonicVersion(
            ionicVersion: Record<string, boolean>,
            dep: Record<string, string>,
            devDep: Record<string, string>,
            existsSyncFake: (path: fs.PathLike) => boolean
        ) {
            sinon.stub(fs, "existsSync").callsFake(existsSyncFake);
            sinon.stub(fs, "readFileSync").callsFake((path: string, options?: string | { encoding?: string, flag?: string }) => {
                return JSON.stringify({
                    dependencies: dep,
                    devDependencies: devDep,
                });
            });

            let versionsRef: IIonicVersion = Object.assign(
                {
                    isIonic1: false,
                    isIonic2: false,
                    isIonic3: false,
                    isIonic4: false,
                    isIonic5: false,
                },
                ionicVersion
            );

            const versionsProcessed = CordovaProjectHelper.checkIonicVersions(ionicProjectPath);
            assert.deepStrictEqual(versionsProcessed, versionsRef);
        }

        test("should detect Ionic 1 version", () => {
            checkIonicVersion(
                { isIonic1: true },
                {},
                {},
                (path) => true
            );
        });
        test("should detect Ionic 2 version", () => {
            checkIonicVersion(
                { isIonic2: true },
                { "ionic-angular": "2.6.5" },
                { "@ionic/app-scripts": "2.3.4" },
                (path) => path === ionicPackageJsonFileLocation
            );
        });
        test("should detect Ionic 3 version", () => {
            checkIonicVersion(
                { isIonic3: true },
                { "ionic-angular": "3.9.9" },
                { "@ionic/app-scripts": "3.3.4" },
                (path) => path === ionicPackageJsonFileLocation
            );
        });
        test("should detect Ionic 4 version", () => {
            checkIonicVersion(
                { isIonic4: true },
                { "@ionic/angular": "4.0.4" },
                { "@ionic-native/core": "4.0.4" },
                (path) => path === ionicPackageJsonFileLocation
            );
        });
        test("should detect Ionic 5 version", () => {
            checkIonicVersion(
                { isIonic5: true },
                { "@ionic/angular": "5.0.0" },
                { "@ionic-native/core": "5.0.0" },
                (path) => path === ionicPackageJsonFileLocation
            );
        });
        test("shouldn't detect any Ionic version", () => {
            checkIonicVersion(
                {},
                {},
                {},
                (path) => false
            );
        });
    });

    suite("getEnvArgument", function () {
        function checkEnvData(envData: any, envFileData: any = {}) {
            let launchArgs: any = {
                    cwd: testProjectPath,
                    platform: "android",
                    ionicLiveReload: false,
                    request: "attach",
                    port: 9222,
                    env: envData,
            };

            let envRef = Object.assign({}, process.env);
            if (Object.keys(envFileData).length > 0) {
                launchArgs.envFile = path.join(testProjectPath, ".env");
                Object.assign(envRef, envFileData);
            }
            Object.assign(envRef, envData);

            try {
                const envProcessed = Object.assign({}, CordovaProjectHelper.getEnvArgument(launchArgs));
                assert.deepStrictEqual(envProcessed, envRef);
            } finally {
                Object.keys(envData).forEach(key => {
                    delete process.env[key];
                });

                Object.keys(envFileData).forEach(key => {
                    delete process.env[key];
                });
            }
        }

        function checkEnvDataFromFile(env: any, envFile: any, envStrRepres: string) {
            sinon.stub(fs, "readFileSync").callsFake((path: string, options?: string | { encoding?: string, flag?: string }) => {
                return envStrRepres;
            });

            checkEnvData(env, envFile);

            (fs.readFileSync as any).restore();
        }

        test("should return default process.env", () => {
            checkEnvData({});
        });
        test("should return env data from launchArgs.env parameter", () => {
            checkEnvData({
                "TEST1": "test1",
                "TEST2": "123",
            });
        });
        test("should return env data from a .env file", () => {
            checkEnvDataFromFile(
                {},
                {
                    "TEST1": "test1",
                    "TEST2": "123",
                },
                "TEST1=test1\nTEST2=123"
            );
        });
        test("should return env data: env variables from a .env file are overwritten with ones from launchArgs.env parameter", () => {
            checkEnvDataFromFile(
                {
                    "TEST1": "test_test",
                    "TEST2": "1234",
                },
                {
                    "TEST1": "test1",
                    "TEST2": "123",
                    "TEST3": "test3",
                },
                "TEST1=test1\nTEST2=123\nTEST3=test3"
            );
        });
        test("should skip incorrectly formatted env data", () => {
            checkEnvDataFromFile(
                {},
                {
                    "TEST1": "test1",
                    "TEST2": "123",
                },
                "TEST1=test1\nTEST2=123\nTEST3test3"
            );
        });
    });
});
