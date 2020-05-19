// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as mockery from "mockery";

// Used only for the type to allow mocking
import {CordovaIosDeviceLauncher as _CordovaIosDeviceLauncher} from "../../src/debugger/cordovaIosDeviceLauncher";
import { assert } from "should";

let CordovaIosDeviceLauncher: typeof _CordovaIosDeviceLauncher;

describe("cordovaIosDeviceLauncher", function () {
    let plistMock: any = {};
    let fsMock: any = {};

    before(() => {
        // warnOnUnregistered is set to false because of https://github.com/mfncooper/mockery/issues/59
        mockery.enable({warnOnReplace: false, useCleanCache: true, warnOnUnregistered: false});
        mockery.registerAllowables([
            "../../src/debugger/cordovaIosDeviceLauncher",
            "path",
            "q",
        ]);
        mockery.registerMock("child_process", {exec: () => {}});
        mockery.registerMock("net", {});

        mockery.registerMock("fs", fsMock);
        mockery.registerMock("plist", plistMock);
        CordovaIosDeviceLauncher = require("../../src/debugger/cordovaIosDeviceLauncher").CordovaIosDeviceLauncher;
    });
    after(() => {
        mockery.disable();
    });

    beforeEach(() => {
        let mocksToReset = [fsMock, plistMock];
        mocksToReset.forEach(mock => {
            for (let prop in mock) {
                if (mock.hasOwnProperty(prop)) {
                    delete mock[prop];
                }
            }
        });
    });

    it("should be able to find the bundle identifier", () => {
        fsMock.readFileSync = (_file: string) => "";
        fsMock.readdir = (_path: string, callback: (err: Error, result: string[]) => void) => callback(null, ["foo", "bar.xcodeproj"]);
        plistMock.parse = (_file: string) => {
            return {CFBundleIdentifier: "test.bundle.identifier"};
        };

        return CordovaIosDeviceLauncher.getBundleIdentifier("testApp").then((bundleId) => {
            should.equal(bundleId, "test.bundle.identifier");
        });
    });
});
