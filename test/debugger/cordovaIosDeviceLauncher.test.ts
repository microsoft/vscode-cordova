// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as fs from "fs";
import * as should from "should";
import Sinon = require("sinon");
import * as plist from "plist";

import { CordovaIosDeviceLauncher } from "../../src/debugger/cordovaIosDeviceLauncher";

suite("cordovaIosDeviceLauncher", function () {
    let readdirMock;
    let readFileSyncMock;
    let parseMock;

    suiteTeardown(() => {
        readdirMock.restore();
        readFileSyncMock.restore();
        parseMock.restore();
    });

    test("should be able to find the bundle identifier", async () => {
        readdirMock = (Sinon.stub(fs.promises, "readdir") as any).returns(
            Promise.resolve(["foo", "bar.xcodeproj"]),
        );
        readFileSyncMock = Sinon.stub(fs, "readFileSync").returns("");
        parseMock = Sinon.stub(plist, "parse").returns({
            CFBundleIdentifier: "test.bundle.identifier",
        });

        const bundleId = await CordovaIosDeviceLauncher.getBundleIdentifier("testApp");
        should.equal(bundleId, "test.bundle.identifier");
    });
});
