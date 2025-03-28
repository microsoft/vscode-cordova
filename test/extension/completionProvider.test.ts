// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as assert from "assert";
import { CordovaConfigurationCompletionProvider } from "../../src/extension/completionProviders";

suite("completionProvider", function () {
    suite("cordovaConfigCompletionProvider", function () {
        test("should get correct argument when input line prefix", () => {
            const provider = new CordovaConfigurationCompletionProvider();

            const input1 = "<w";
            const completionItem1 = provider.getConfigCompletionItems(input1);
            assert.deepStrictEqual(
                completionItem1[0].insertText["value"],
                'widget xmlns="" xmlns:cdv="" id="" version="">\n\n</widget>',
            );

            const input2 = "<a";
            const completionItem2 = provider.getConfigCompletionItems(input2);
            assert.deepStrictEqual(
                completionItem2[0].insertText["value"],
                'author email="" href="">\n\n</author>',
            );
            assert.deepStrictEqual(completionItem2[1].insertText["value"], 'access origin="" />');
            assert.deepStrictEqual(
                completionItem2[2].insertText["value"],
                'allow-intent href="" />',
            );

            const input3 = "invalid";
            const completionItem3 = provider.getConfigCompletionItems(input3);
            assert.deepStrictEqual(completionItem3, undefined);
        });
    });
});
