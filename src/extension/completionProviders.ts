// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as fs from "fs";
import * as path from "path";
import {
    CompletionItem,
    CompletionItemKind,
    CompletionItemProvider,
    DocumentSelector,
    SnippetString,
} from "vscode";
import * as vscode from "vscode";
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
                this.makeCompletionItem(rawSnippets[name]),
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

    private makeCompletionItem(rawSnippet: TMSnippet): CompletionItem {
        const item = new CompletionItem(rawSnippet.prefix);
        item.documentation = rawSnippet.description;
        item.kind = CompletionItemKind.Snippet;
        item.insertText = new SnippetString(rawSnippet.body.join("\n"));

        return item;
    }
}

export class CordovaConfigurationCompletionProvider implements CompletionItemProvider {
    public static CORDOVA_CONFIG_SELECTOR: DocumentSelector = "xml";

    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        context: vscode.CompletionContext,
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        if (path.basename(document.uri.fsPath) !== "config.xml") {
            return [];
        }

        const linePrefix = document.lineAt(position).text.slice(0, position.character);
        switch (linePrefix.trim()) {
            case "<w":
                const widgetItem = new vscode.CompletionItem("<widget");
                widgetItem.insertText = new vscode.SnippetString(
                    'widget xmlns="" xmlns:cdv="" id="" version="">\n\n</widget>',
                );
                return [widgetItem];
            case "<n":
                const nameItem = new vscode.CompletionItem("<name");
                nameItem.insertText = new vscode.SnippetString("name> </name>");
                return [nameItem];
            case "<d":
                const descriptionItem = new vscode.CompletionItem("<description");
                descriptionItem.insertText = new vscode.SnippetString(
                    "descriptionItem> </descriptionItem>",
                );
                return [descriptionItem];
            case "<a":
                const autherItem = new vscode.CompletionItem("<author");
                autherItem.insertText = new vscode.SnippetString(
                    'author email="" href="">\n\n</author>',
                );
                const accessItem = new vscode.CompletionItem("<access");
                accessItem.insertText = new vscode.SnippetString('access origin="" />');
                const allowIntentItem = new vscode.CompletionItem("<allow-intent");
                allowIntentItem.insertText = new vscode.SnippetString('allow-intent href="" />');
                return [autherItem, accessItem, allowIntentItem];
            case "<c":
                const contentItem = new vscode.CompletionItem("<content");
                contentItem.insertText = new vscode.SnippetString('content src=""/>');
                return [contentItem];
            case "<p":
                const platformItem = new vscode.CompletionItem("<platform");
                platformItem.insertText = new vscode.SnippetString(
                    'platform name="" href="">\n    <preference name="" value="" />\n</platform>',
                );
                return [platformItem];
            default:
                return undefined;
        }
    }
}
