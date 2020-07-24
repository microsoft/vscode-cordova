// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as fs from "fs";
import * as url from "url";
import { ICordovaAttachRequestArgs } from "../requestArgs";
import { CordovaProjectHelper } from "../../utils/cordovaProjectHelper";
import { IProjectType } from "../../utils/cordovaProjectHelper";

export class SourcemapPathTransformer {
    private _cordovaRoot: string;
    private _platform: string;
    private _webRoot: string;
    private _projectTypes: IProjectType;
    private _ionicLiveReload: boolean;

    constructor(args: ICordovaAttachRequestArgs, projectTypes: IProjectType) {
        this._cordovaRoot = args.cwd;
        this._platform = args.platform.toLowerCase();
        this._webRoot = args.address || this._cordovaRoot;
        this._ionicLiveReload = args.ionicLiveReload || false;
        this._projectTypes = projectTypes;
     }

    public getClientPath(sourceUrl: string): string {
        let sourceUrlPath;
        try {
            sourceUrlPath = url.parse(sourceUrl).pathname || "/";
        } catch (err) {
            sourceUrlPath = "/";
        }

        let wwwRoot = path.join(this._cordovaRoot, "www");

        // Given an absolute file:/// (such as from the iOS simulator) vscode-chrome-debug's
        // default behavior is to use that exact file, if it exists. We don't want that,
        // since we know that those files are copies of files in the local folder structure.
        // A simple workaround for this is to convert file:// paths to bogus http:// paths

        let defaultPath = "";
        let foldersForSearch = [this._webRoot, this._cordovaRoot, wwwRoot];

        if (this._projectTypes.isIonic4 || this._projectTypes.isIonic5) {
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
            let mappedPath = this.targetUrlToClientPath(sourceUrlPath, searchFolder);

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

    private targetUrlToClientPath(sourceUrlPath: string, searchFolder: string): string {
        const rest = sourceUrlPath.substring(1);
        const absoluteSourcePath = rest ?
            CordovaProjectHelper.properJoin(searchFolder, rest) :
            searchFolder;

        return CordovaProjectHelper.existsSync(absoluteSourcePath) ?
            absoluteSourcePath : "";
    }
}
