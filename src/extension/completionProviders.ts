// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as fs from "fs";
import {
    CompletionItem,
    CompletionItemKind,
    CompletionItemProvider,
    DocumentSelector,
    SnippetString,
} from "vscode";
import * as nls from "vscode-nls";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

// Types to outline TextMate snippets format, used in this extension's snippet files
type TMSnippet = { prefix: string; body: string[]; description: string };
type TMSnippets = { [name: string]: TMSnippet };

export class IonicCompletionProvider implements CompletionItemProvider {
    public static HTML_DOCUMENT_SELECTOR: DocumentSelector = "html";
    public static JS_DOCUMENT_SELECTOR: DocumentSelector = "javascript";

    private snippetCompletions: CompletionItem[];

    constructor(private completionsSource: string) {}

    public provideCompletionItems(): CompletionItem[] {
        if (this.snippetCompletions) {
            return this.snippetCompletions;
        }

        this.snippetCompletions = [];

        try {
            const rawSnippets: TMSnippets = JSON.parse(
                fs.readFileSync(this.completionsSource, "utf8"),
            );
            this.snippetCompletions = Object.keys(rawSnippets).map(name =>
                makeCompletionItem(rawSnippets[name]),
            );
        } catch (err) {
            // Log error here and do not try to read snippets anymore
            console.warn(
                localize(
                    "FailedToReadSnippetsFrom",
                    "Failed to read snippets from {0}",
                    this.completionsSource,
                ),
            );
        }

        return this.snippetCompletions;
    }
}

function makeCompletionItem(rawSnippet: TMSnippet): CompletionItem {
    const item = new CompletionItem(rawSnippet.prefix);
    item.documentation = rawSnippet.description;
    item.kind = CompletionItemKind.Snippet;
    item.insertText = new SnippetString(rawSnippet.body.join("\n"));

    return item;
}
