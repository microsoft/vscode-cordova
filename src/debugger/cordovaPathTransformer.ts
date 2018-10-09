// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {logger, utils, chromeUtils, IPathMapping, ISetBreakpointsArgs, BasePathTransformer, IStackTraceResponseBody} from "vscode-chrome-debug-core";
import {ICordovaLaunchRequestArgs, ICordovaAttachRequestArgs} from "./cordovaDebugAdapter";

// import {BasePathTransformer} from "vscode-chrome-debug-core";

import * as path from "path";
import * as fs from "fs";

/**
 * Converts a local path from Code to a path on the target.
 */
export class CordovaPathTransformer extends BasePathTransformer {
    private _cordovaRoot: string;
    private _platform: string;
    private _webRoot: string;
    private _clientPathToWebkitUrl = new Map<string, string>();
    private _webkitUrlToClientPath = new Map<string, string>();
    private _outputLogger: (message: string, error?: boolean | string) => void;

    constructor(outputLogger: (message: string) => void) {
        super();
        this._outputLogger = outputLogger;
        (<any>global).cordovaPathTransformer = this;
    }

    public launch(args: ICordovaLaunchRequestArgs): Promise<void> {
        return this.attach(args);
    }

    public attach(args: ICordovaAttachRequestArgs): Promise<void> {
        this._cordovaRoot = args.cwd;
        this._platform = args.platform.toLowerCase();
        this._webRoot = args.address || this._cordovaRoot;
        return;
    }

    public setBreakpoints(args: ISetBreakpointsArgs): ISetBreakpointsArgs {
        if (!args.source.path) {
            // sourceReference script, nothing to do
            return args;
        }

        if (utils.isURL(args.source.path)) {
            // already a url, use as-is
            logger.log(`Paths.setBP: ${args.source.path} is already a URL`);
            return args;
        }

        const path = utils.canonicalizeUrl(args.source.path);
        const url = this.getTargetPathFromClientPath(path);
        if (url) {
            args.source.path = url;
            logger.log(`Paths.setBP: Resolved ${path} to ${args.source.path}`);
            return args;
        } else {
            logger.log(`Paths.setBP: No target url cached yet for client path: ${path}.`);
            args.source.path = path;
            return args;
        }
    }

    public clearTargetContext(): void {
        this._clientPathToWebkitUrl = new Map<string, string>();
        this._webkitUrlToClientPath = new Map<string, string>();
    }

    public scriptParsed(scriptUrl: string): Promise<string> {
        const clientPath = this.getClientPath(scriptUrl);

        if (clientPath) {
            logger.log(`Paths.scriptParsed: resolved ${scriptUrl} to ${clientPath}`);
            const canonicalizedClientPath = utils.canonicalizeUrl(clientPath);
            this._clientPathToWebkitUrl.set(canonicalizedClientPath, scriptUrl);
            this._webkitUrlToClientPath.set(scriptUrl, clientPath);

            scriptUrl = clientPath;
        }

        return Promise.resolve(scriptUrl);
    }

    public stackTraceResponse(response: IStackTraceResponseBody): void {
        response.stackFrames.forEach(frame => {
            if (frame.source.path) {
                // Try to resolve the url to a path in the workspace. If it's not in the workspace,
                // just use the script.url as-is. It will be resolved or cleared by the SourceMapTransformer.
                const clientPath = this._webkitUrlToClientPath.has(frame.source.path) ?
                    this._webkitUrlToClientPath.get(frame.source.path) :
                    this.getClientPath(frame.source.path);

                // Incoming stackFrames have sourceReference and path set. If the path was resolved to a file in the workspace,
                // clear the sourceReference since it's not needed.
                if (clientPath) {
                    frame.source.path = clientPath;
                    frame.source.sourceReference = 0;
                }
            }
        });
    }

    public getClientPath(sourceUrl: string): string {
        let wwwRoot = path.join(this._cordovaRoot, "www");

        // Given an absolute file:/// (such as from the iOS simulator) vscode-chrome-debug's
        // default behavior is to use that exact file, if it exists. We don't want that,
        // since we know that those files are copies of files in the local folder structure.
        // A simple workaround for this is to convert file:// paths to bogus http:// paths
        // Find the mapped local file. Try looking first in the user-specified webRoot, then in the project root, and then in the www folder
        let defaultPath = "";
        [this._webRoot, this._cordovaRoot, wwwRoot].find((searchFolder) => {
            const pathMapping: IPathMapping = {
                "file:///": "http://localhost/",
                "/": `${searchFolder}`,
            };
            let mappedPath = chromeUtils.targetUrlToClientPath(sourceUrl, pathMapping);

            if (mappedPath) {
                defaultPath = mappedPath;
                return true;
            }

            return false;
        });

        if (defaultPath.toLowerCase().indexOf(wwwRoot.toLowerCase()) === 0) {
            // If the path appears to be in www, check to see if it exists in /merges/<platform>/<relative path>
            let relativePath = path.relative(wwwRoot, defaultPath);
            let mergesPath = path.join(this._cordovaRoot, "merges", this._platform, relativePath);
            if (fs.existsSync(mergesPath)) {
                // This file is overriden by a merge: Use that one
                return mergesPath;
            }
        }
        return defaultPath;
    }


}
