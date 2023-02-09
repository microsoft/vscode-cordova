// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { ErrorHelper } from "../../../src/common/error/errorHelper";
import { InternalErrorCode } from "../../../src/common/error/internalErrorCode";
import * as assert from "assert";

suite("errorHelper", function () {
    suite("commonContext", function () {
        const nestedErrorWithArgs = ErrorHelper.getNestedError(
            new Error("Nested ES Error"),
            InternalErrorCode.CommandFailed,
            "Command failed with ES Error",
        );
        const commandFailedWithDetails = ErrorHelper.getInternalError(
            InternalErrorCode.CommandFailedWithDetails,
            "{command}",
            "{details}",
        );
        const nvsHomeNotFoundMessage = ErrorHelper.getInternalError(
            InternalErrorCode.NvsHomeNotFoundMessage,
        );
        const nvmWindowsNotFoundMessage = ErrorHelper.getInternalError(
            InternalErrorCode.NvmWindowsNotFoundMessage,
        );
        const nvmHomeNotFoundMessage = ErrorHelper.getInternalError(
            InternalErrorCode.NvmHomeNotFoundMessage,
        );

        const warning = ErrorHelper.getWarning("Warning");
        const nestedWarning = ErrorHelper.getNestedWarning(new Error("Nested ES Error"), "Warning");

        test("nested error object with arguments should have correct error message on English", (done: Mocha.Done) => {
            assert.strictEqual(
                nestedErrorWithArgs.message,
                "Error while executing command 'Command failed with ES Error': Nested ES Error",
            );
            done();
        });

        test("internal error object with failed command and details should have correct CommandFailedWithDetails errors in English", (done: Mocha.Done) => {
            assert.strictEqual(
                commandFailedWithDetails.message,
                "Error while executing command '{command}'.\nDetails: {details} (error code 102)",
            );
            done();
        });

        test("internal error object with failed command and details should have correct NvsHomeNotFoundMessage errors in English", (done: Mocha.Done) => {
            assert.strictEqual(
                nvsHomeNotFoundMessage.message,
                "Attribute runtimeVersion requires Node.js version manager 'nvs' (error code 103)",
            );
            done();
        });

        test("internal error object with failed command and details should have correct NvmWindowsNotFoundMessage errors in English", (done: Mocha.Done) => {
            assert.strictEqual(
                nvmWindowsNotFoundMessage.message,
                "Attribute runtimeVersion requires Node.js version manager nvm-windows or nvs (error code 104)",
            );
            done();
        });

        test("warning object should have correct error message on English", (done: Mocha.Done) => {
            assert.strictEqual(warning.errorCode, -1);
            assert.strictEqual(warning.message, "Warning");
            done();
        });

        test("nested warning object should have correct error message on English", (done: Mocha.Done) => {
            assert.strictEqual(nestedWarning.errorCode, -1);
            assert.strictEqual(nestedWarning.message, "Warning: Nested ES Error");
            done();
        });

        test("internal error object with failed command and details should have correct NvmHomeNotFoundMessage errors in English", (done: Mocha.Done) => {
            assert.strictEqual(
                nvmHomeNotFoundMessage.message,
                "Attribute runtimeVersion requires Node.js version manager nvm or nvs (error code 105)",
            );
            done();
        });
    });
});
