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
                expectedValue: string | boolean | undefined,
            ) {
                const argumentsBeforeOperation = Array.from(runArguments);
                const foundedValue = AbstractPlatform.getOptFromRunArgs(
                    runArguments,
                    key,
                    typeof expectedValue === "boolean",
                );

                assert.strictEqual(foundedValue, expectedValue);
                assert.deepStrictEqual(
                    runArguments,
                    argumentsBeforeOperation,
                    `Array of the run arguments has been changed after operation:
                    Before: ${argumentsBeforeOperation.toString()}
                     ---
                    After: ${runArguments.toString()}`,
                );
            }

            test("Should return undefined for the not presented non binary argument", function () {
                getArgumentValueTest(runArguments, "notPresentedArgument", undefined);
            });

            test("Should return value of the separated argument", function () {
                getArgumentValueTest(
                    runArguments,
                    stringSeparatedArgumentKey,
                    stringSeparatedArgumentValue,
                );
            });

            test("Should return value of the united argument", function () {
                getArgumentValueTest(
                    runArguments,
                    stringUnitedArgumentKey,
                    stringUnitedArgumentValue,
                );
            });

            test("Should return true for the presented binary argument", function () {
                getArgumentValueTest(runArguments, presentedBooleanArgumentKey, true);
            });

            test("Should return false for the not presented binary argument", function () {
                getArgumentValueTest(runArguments, notPresentedBooleanArgumentKey, false);
            });
        });

        suite("setRunArgument", function () {
            function setArgumentValueTest(
                runArguments: string[],
                key: string,
                value: string | boolean,
            ) {
                AbstractPlatform.setRunArgument(runArguments, key, value);

                let setValue: string | boolean;
                let keyIndex = runArguments.indexOf(key);
                if (typeof value === "boolean") {
                    setValue = keyIndex > -1;
                } else if (keyIndex > -1) {
                    setValue = runArguments[keyIndex + 1];
                } else {
                    for (const [i, runArgument] of runArguments.entries()) {
                        if (runArgument.includes(key)) {
                            keyIndex = i;
                            break;
                        }
                    }
                    setValue = runArguments[keyIndex].split("=")[1];
                }

                assert.strictEqual(setValue, value);
            }

            test("Should set new value for the united argument", function () {
                setArgumentValueTest(
                    runArguments,
                    stringUnitedArgumentKey,
                    "newStringUnitedArgumentValue",
                );
            });

            test("Should set new value for the separated argument", function () {
                setArgumentValueTest(
                    runArguments,
                    stringSeparatedArgumentKey,
                    "newStringSeparatedArgumentValue",
                );
            });

            test("Should add key and value for not presented separated argument", function () {
                setArgumentValueTest(runArguments, "newKey", "newValue");
            });

            test("Should remove binary argument in case new value is false", function () {
                setArgumentValueTest(runArguments, presentedBooleanArgumentKey, false);
            });

            test("Should add new binary argument in case new value is true", function () {
                setArgumentValueTest(runArguments, notPresentedBooleanArgumentKey, true);
            });
        });

        suite("removeRunArgument", function () {
            function removeArgumentValueTest(
                runArguments: string[],
                key: string,
                isBinary: boolean,
                isSeparatedArgument?: boolean,
            ) {
                const argsLengthBefore = runArguments.length;
                AbstractPlatform.removeRunArgument(runArguments, key, isBinary);

                const keyIndex = runArguments.indexOf(key);
                if (isBinary || argsLengthBefore - runArguments.length === 2) {
                    if (keyIndex > -1) {
                        assert.fail("Binary argument was not removed");
                    }
                } else if (isSeparatedArgument) {
                    if (keyIndex > -1 || argsLengthBefore - runArguments.length !== 2) {
                        assert.fail("Separated argument was not removed");
                    }
                } else {
                    if (argsLengthBefore - runArguments.length !== 1) {
                        assert.fail("United argument was not removed");
                    }
                    for (const runArgument of runArguments) {
                        if (runArgument.includes(key)) {
                            assert.fail("United argument was not removed");
                        }
                    }
                }
            }

            test("Should remove the united argument", function () {
                removeArgumentValueTest(runArguments, stringUnitedArgumentKey, false, false);
            });

            test("Should remove the separated argument", function () {
                removeArgumentValueTest(runArguments, stringSeparatedArgumentKey, false, true);
            });

            test("Should remove binary argument", function () {
                removeArgumentValueTest(runArguments, presentedBooleanArgumentKey, true);
            });
        });
    });
});
