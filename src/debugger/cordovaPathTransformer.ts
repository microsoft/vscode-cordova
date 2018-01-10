// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {DebugProtocol} from 'vscode-debugprotocol';
import {utils, logger, chromeUtils, ISetBreakpointsArgs, IDebugTransformer, IStackTraceResponseBody} from 'vscode-chrome-debug-core';
import {ICordovaLaunchRequestArgs, ICordovaAttachRequestArgs} from './cordovaDebugAdapter';

import {BasePathTransformer} from 'vscode-chrome-debug-core';

import * as path from 'path';
import * as fs from 'fs';

interface IPendingBreakpoint {
    resolve: () => void;
    reject: (e: Error) => void;
    args: ISetBreakpointsArgs;
}

/**
 * Converts a local path from Code to a path on the target.
 */
export class CordovaPathTransformer extends BasePathTransformer {
    private _cordovaRoot: string;
    private _platform: string;
    private _webRoot: string;
    private _clientPathToWebkitUrl = new Map<string, string>();
    private _webkitUrlToClientPath = new Map<string, string>();
    private _shadowedClientPaths = new Map<string, string>();
    private _pendingBreakpointsByPath = new Map<string, IPendingBreakpoint>();
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
        this._webRoot = args.webRoot || this._cordovaRoot;
        return;
    }

    public setBreakpoints(args: ISetBreakpointsArgs): Promise<void> {
        return new Promise<void>((resolve, reject) => {

            if (!args.source.path) {
                resolve();
                return;
            }

            if (utils.isURL(args.source.path)) {
                // already a url, use as-is
                logger.log(`Paths.setBP: ${args.source.path} is already a URL`);
                resolve();
                return;
            }

            const url = utils.canonicalizeUrl(args.source.path);
            if (this._clientPathToWebkitUrl.has(url)) {
                args.source.path = this._clientPathToWebkitUrl.get(url);
                logger.log(`Paths.setBP: Resolved ${url} to ${args.source.path}`);
                resolve();
            } else if (this._shadowedClientPaths.has(url)) {
                this._outputLogger(`Warning: Breakpoint set in overriden file ${url} will not be hit. Use ${this._shadowedClientPaths.get(url)} instead.`, true);
                reject();
            } else {
                logger.log(`Paths.setBP: No target url cached for client path: ${url}, waiting for target script to be loaded.`);
                args.source.path = url;
                this._pendingBreakpointsByPath.set(args.source.path, { resolve, reject, args });
            }
        });
    }

    public clearClientContext(): void {
        this._pendingBreakpointsByPath = new Map<string, IPendingBreakpoint>();
    }

    public clearTargetContext(): void {
        this._clientPathToWebkitUrl = new Map<string, string>();
        this._webkitUrlToClientPath = new Map<string, string>();
        this._shadowedClientPaths = new Map<string, string>();
    }

    public scriptParsed(scriptPath: string): Promise<string> {
        const webkitUrl: string = scriptPath;
        const clientPath = this.getClientPath(webkitUrl);

        if (!clientPath) {
            logger.log(`Paths.scriptParsed: could not resolve ${webkitUrl} to a file in the workspace. webRoot: ${this._webRoot}`);
        } else {
            logger.log(`Paths.scriptParsed: resolved ${webkitUrl} to ${clientPath}. webRoot: ${this._webRoot}`);
            this._clientPathToWebkitUrl.set(clientPath, webkitUrl);
            this._webkitUrlToClientPath.set(webkitUrl, clientPath);

            scriptPath = clientPath;
        }

        if (this._pendingBreakpointsByPath.has(scriptPath)) {
            logger.log(`Paths.scriptParsed: Resolving pending breakpoints for ${scriptPath}`);
            const pendingBreakpoint = this._pendingBreakpointsByPath.get(scriptPath);
            this._pendingBreakpointsByPath.delete(scriptPath);
            this.setBreakpoints(pendingBreakpoint.args).then(pendingBreakpoint.resolve, pendingBreakpoint.reject);
        }
        return Promise.resolve(scriptPath);
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
        let wwwRoot = path.join(this._cordovaRoot, 'www');

        // Given an absolute file:/// (such as from the iOS simulator) vscode-chrome-debug's
        // default behavior is to use that exact file, if it exists. We don't want that,
        // since we know that those files are copies of files in the local folder structure.
        // A simple workaround for this is to convert file:// paths to bogus http:// paths
        sourceUrl = sourceUrl.replace('file:///', 'http://localhost/');

        // Find the mapped local file. Try looking first in the user-specified webRoot, then in the project root, and then in the www folder
        let defaultPath = '';
        [this._webRoot, this._cordovaRoot, wwwRoot].find((searchFolder) => {
            let mappedPath = chromeUtils.targetUrlToClientPath(searchFolder, sourceUrl);

            if (mappedPath) {
                defaultPath = mappedPath;
                return true;
            }

            return false;
        });

        if (defaultPath.toLowerCase().indexOf(wwwRoot.toLowerCase()) === 0) {
            // If the path appears to be in www, check to see if it exists in /merges/<platform>/<relative path>
            let relativePath = path.relative(wwwRoot, defaultPath);
            let mergesPath = path.join(this._cordovaRoot, 'merges', this._platform, relativePath);
            if (fs.existsSync(mergesPath)) {
                // This file is overriden by a merge: Use that one
                if (fs.existsSync(defaultPath)) {
                    this._shadowedClientPaths.set(defaultPath, mergesPath);
                    if (this._pendingBreakpointsByPath.has(defaultPath)) {
                        this._outputLogger(`Warning: Breakpoint set in overriden file ${defaultPath} will not be hit. Use ${mergesPath} instead.`, true);
                    }
                }
                return mergesPath;
            }
        }
        return defaultPath;
    }
}
