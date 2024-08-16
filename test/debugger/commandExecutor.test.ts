// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as assert from "assert";
import { execCommand } from "../../src/debugger/extension";

suite("commandExecutor", function () {
    suite("execCommand", function () {
        test("should execute a command", function () {
            return execCommand("node", ["-v"], message => {
                console.log(message);
            }).then(result => {
                assert(result);
            });
        });

        test("should reject on bad command", () => {
            return execCommand("ber", ["test"], message => {
                console.log(message);
            })
                .then(result => {
                    assert.fail("bar test should not be a valid command");
                })
                .catch(err => {
                    console.log(err.message);
                    assert.strictEqual(err.message, "Error running ber test");
                });
        });
    });
});
