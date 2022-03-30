// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as assert from "assert";
import AbstractPlatform from "../../src/extension/abstractPlatform";

suite("AbstractPlatform", function () {

    suite("Run arguments", function () {
        const stringSeparatedArgumentKey = "separatedKey";
        const stringSeparatedArgumentValue = "separatedValue";
        const stringUnitedArgumentKey = "unitedKey";
        const stringUnitedArgumentValue = "unitedValue";
        const presentedBooleanArgumentKey = "presentedBooleanArgument";
        const notPresentedBooleanArgumentKey = "notPresentedBooleanArgument";

        let runArguments: string[];

        this.beforeEach(function () {
            runArguments = [
                `${stringUnitedArgumentKey}=${stringUnitedArgumentValue}`,
                presentedBooleanArgumentKey,
                stringSeparatedArgumentKey,
                stringSeparatedArgumentValue,
            ];
        });

        suite("getOptFromRunArgs", function () {
            function getArgumentValueTest(
                runArguments: string[],
                key: string,
                expectedValue: string | boolean | undefined
            ) {
                const argumentsBeforeOperation = Array.from(runArguments);
                const foundedValue = AbstractPlatform.getOptFromRunArgs(
                    runArguments,
                    key,
                    typeof expectedValue === "boolean"
                );

                assert.strictEqual(foundedValue, expectedValue);
                assert.deepStrictEqual(
                    runArguments,
                    argumentsBeforeOperation,
                    `Array of the run arguments has been changed after operation:
                    Before: ${before.toString()}
                     ---
                    After: ${after.toString()}`
                );
            }

            test("Should return undefined for the not presented non binary argument", function () {
                getArgumentValueTest(
                    runArguments,
                    "notPresentedArgument",
                    undefined
                );
            });

            test("Should return value of the separated argument", function () {
                getArgumentValueTest(
                    runArguments,
                    stringSeparatedArgumentKey,
                    stringSeparatedArgumentValue
                );
            });

            test("Should return value of the united argument", function () {
                getArgumentValueTest(
                    runArguments,
                    stringUnitedArgumentKey,
                    stringUnitedArgumentValue
                );
            });

            test("Should return true for the presented binary argument", function () {
                getArgumentValueTest(
                    runArguments,
                    presentedBooleanArgumentKey,
                    true
                );
            });

            test("Should return false for the not presented binary argument", function () {
                getArgumentValueTest(
                    runArguments,
                    notPresentedBooleanArgumentKey,
                    true
                );
            });
        });

        suite("Setting run arguments", function () {
            function setArgumentValueTest(
                runArguments: string[],
                key: string,
                value: string | boolean
            ) {

                AbstractPlatform.setRunArgument(
                    runArguments,
                    key,
                    value
                );

                let settedValue: string | boolean;
                let keyIndex = runArguments.indexOf(key);
                if (typeof value === "boolean") {
                    if (keyIndex > -1) {
                        settedValue = true;
                    } else {
                        settedValue = false;
                    }
                } else {
                    if (keyIndex > -1) {
                        settedValue = runArguments[keyIndex + 1];
                    } else {
                        for (let i = 0; i < runArguments.length; i++) {
                            if (runArguments[i].includes(key)) {
                                keyIndex = i;
                                break;
                            }
                        }
                        settedValue = runArguments[keyIndex].split("=")[1];
                    }
                }

                assert.strictEqual(settedValue, value);
            }

            test("Should set new value for the separated argument", function () {
                setArgumentValueTest(
                    runArguments,
                    stringSeparatedArgumentKey,
                    stringSeparatedArgumentValue
                );
            });
        });
    });
});
