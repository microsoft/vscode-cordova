// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {logger, utils, chromeUtils, IPathMapping, BasePathTransformer, IStackTraceResponseBody} from "vscode-chrome-debug-core";
import {ICordovaLaunchRequestArgs, ICordovaAttachRequestArgs} from "./cordovaDebugAdapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { TelemetryHelper } from "../utils/telemetryHelper";
import * as path from "path";
import * as fs from "fs";


/**
 * Converts a local path from Code to a path on the target.
 */
export class CordovaPathTransformer extends BasePathTransformer {
    private _pathMapping: IPathMapping;
    private _clientPathToTargetUrl = new Map<string, string>();
    private _targetUrlToClientPath = new Map<string, string>();
    private _cordovaRoot: string;
    private _platform: string;
    private _webRoot: string;
    private _projectTypes;
    private _ionicLiveReload: boolean;

    constructor() {
        super();
        (<any>global).cordovaPathTransformer = this;
    }


    public async launch(args: ICordovaLaunchRequestArgs): Promise<void> {
        await this.initRoot(args);
        return super.launch(args);
    }

    public async attach(args: ICordovaAttachRequestArgs): Promise<void> {
        await this.initRoot(args);
        return super.attach(args);
    }

    public setBreakpoints(source: DebugProtocol.Source): DebugProtocol.Source {
        if (!source.path) {
            // sourceReference script, nothing to do
            return source;
        }

        if (utils.isURL(source.path)) {
            // already a url, use as-is
            logger.log(`Paths.setBP: ${source.path} is already a URL`);
            return source;
        }

        const path = utils.canonicalizeUrl(source.path);
        const url = this.getTargetPathFromClientPath(path);
        if (url) {
            source.path = url;
            logger.log(`Paths.setBP: Resolved ${path} to ${source.path}`);
            return source;
        } else {
            logger.log(`Paths.setBP: No target url cached yet for client path: ${path}.`);
            source.path = path;
            return source;
        }
    }

    public clearTargetContext(): void {
        this._clientPathToTargetUrl = new Map<string, string>();
        this._targetUrlToClientPath = new Map<string, string>();
    }

    public async scriptParsed(scriptUrl: string): Promise<string> {
        const clientPath = await this.getClientPath(scriptUrl);

        if (!clientPath) {
            // It's expected that eval scripts (eval://) won't be resolved
            if (!scriptUrl.startsWith(chromeUtils.EVAL_NAME_PREFIX)) {
                logger.log(`Paths.scriptParsed: could not resolve ${scriptUrl} to a file with pathMapping/webRoot: ${JSON.stringify(this._pathMapping)}. It may be external or served directly from the server's memory (and that's OK).`);
            }
        } else {
            logger.log(`Paths.scriptParsed: resolved ${scriptUrl} to ${clientPath}. pathMapping/webroot: ${JSON.stringify(this._pathMapping)}`);
            const canonicalizedClientPath = utils.canonicalizeUrl(clientPath);
            this._clientPathToTargetUrl.set(canonicalizedClientPath, scriptUrl);
            this._targetUrlToClientPath.set(scriptUrl, clientPath);

            scriptUrl = clientPath;
        }

        return Promise.resolve(scriptUrl);
    }

    public async stackTraceResponse(response: IStackTraceResponseBody): Promise<void> {
        await Promise.all(response.stackFrames.map(frame => this.fixSource(frame.source)));
    }

    public async fixSource(source: DebugProtocol.Source): Promise<void> {
        if (source && source.path) {
            // Try to resolve the url to a path in the workspace. If it's not in the workspace,
            // just use the script.url as-is. It will be resolved or cleared by the SourceMapTransformer.
            const clientPath = this.getClientPathFromTargetPath(source.path) ||
                await this.targetUrlToClientPath(source.path);

            // Incoming stackFrames have sourceReference and path set. If the path was resolved to a file in the workspace,
            // clear the sourceReference since it's not needed.
            if (clientPath) {
                source.path = clientPath;
                source.sourceReference = undefined;
                source.origin = undefined;
                source.name = path.basename(clientPath);
            }
        }
    }

    public getTargetPathFromClientPath(clientPath: string): string {
        // If it's already a URL, skip the Map
        return path.isAbsolute(clientPath) ?
            this._clientPathToTargetUrl.get(utils.canonicalizeUrl(clientPath)) :
            clientPath;
    }

    public getClientPathFromTargetPath(targetPath: string): string {
        return this._targetUrlToClientPath.get(targetPath);
    }

    public async getClientPath(sourceUrl: string): Promise<string> {
        let wwwRoot = path.join(this._cordovaRoot, "www");

        // Given an absolute file:/// (such as from the iOS simulator) vscode-chrome-debug's
        // default behavior is to use that exact file, if it exists. We don't want that,
        // since we know that those files are copies of files in the local folder structure.
        // A simple workaround for this is to convert file:// paths to bogus http:// paths

        let defaultPath = "";
        let foldersForSearch = [this._webRoot, this._cordovaRoot, wwwRoot];

        if (this._projectTypes.ionic4) {
            // We don't need to connect ts files with js in www folder
            // because Ionic4 `serve` and `ionic cordova run` with livereload option enabled
            // don't use www directory anymore. If www directory is fulfilled and livereload is used then
            // source maps could be messed up.
            if (this._platform === "serve" || this._ionicLiveReload) {
                foldersForSearch.pop();
            }
        }

        // Find the mapped local file. Try looking first in the user-specified webRoot, then in the project root, and then in the www folder
        for (const searchFolder of foldersForSearch) {
            const pathMapping: IPathMapping = {
                "/": searchFolder,
            };
            let mappedPath = await chromeUtils.targetUrlToClientPath(sourceUrl, pathMapping);

            if (mappedPath) {
                defaultPath = mappedPath;
                break;
            }
        }

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

    /**
     * Overridable for VS to ask Client to resolve path
     */
    protected async targetUrlToClientPath(scriptUrl: string): Promise<string> {
        return Promise.resolve(chromeUtils.targetUrlToClientPath(scriptUrl, this._pathMapping));
    }

    private async initRoot(args: ICordovaAttachRequestArgs) {
        this._pathMapping = args.pathMapping;
        this._cordovaRoot = args.cwd;
        this._platform = args.platform.toLowerCase();
        this._webRoot = args.address || this._cordovaRoot;
        this._ionicLiveReload = args.ionicLiveReload || false;
        this._projectTypes = await TelemetryHelper.determineProjectTypes(args.cwd);
    }

}
