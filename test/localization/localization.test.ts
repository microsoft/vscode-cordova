// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as assert from "assert";
import { ErrorHelper } from "../../src/common/error/errorHelper";
import { InternalErrorCode } from "../../src/common/error/internalErrorCode";

suite("localizationTest", function () {
    suite("localizationContext", function () {
        const commandFailedErrorChs = ErrorHelper.getInternalError(
            InternalErrorCode.CommandFailed,
            "IncorrectCommand",
        );
        const unknownPlatform = ErrorHelper.getInternalError(InternalErrorCode.UnknownPlatform);
        test("localization should show correct message on ZH-CN for CommandFailed error", (done: Mocha.Done) => {
            assert.strictEqual(
                commandFailedErrorChs.message,
                "执行命令 IncorrectCommand 时出错 (error code 101)",
            );
            done();
        });

        test("localization should show correct message on ZH-CN for unknownPlatform error", (done: Mocha.Done) => {
            assert.strictEqual(unknownPlatform.message, "未知平台: {0} (error code 201)");
            done();
        });
    });
});
