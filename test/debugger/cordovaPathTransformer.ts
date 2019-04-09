// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {CordovaPathTransformer} from "../../src/debugger/cordovaPathTransformer";
import * as path from "path";
import "should";

describe("CordovaPathTransformer", () => {

   it("should correctly convert merges paths for android", async () => {
       let output = "";
       let logger = (message: string) => output += message + "\n";
       let pathTransformer = new CordovaPathTransformer(logger);

       // __dirname is '/out/test/debugger' so we need to step up three levels to escape completely
       let testapp = path.join(__dirname, "..", "..", "..", "test", "testProject");
       pathTransformer.attach({cwd: testapp, platform: "android", port: 1234});
       let clientIndexPath = await pathTransformer.getClientPath("file:///android_asset/www/js/index.js");
       let clientMergesPath = await pathTransformer.getClientPath("file:///android_asset/www/js/merged.js");
       clientIndexPath.toLowerCase().should.equal(path.resolve(testapp, "www", "js", "index.js").toLowerCase());
       clientMergesPath.toLowerCase().should.equal(path.resolve(testapp, "merges", "android", "js", "merged.js").toLowerCase());
   }).timeout(5000);
});
