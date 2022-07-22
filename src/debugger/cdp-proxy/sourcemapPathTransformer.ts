// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as fs from "fs";
import * as url from "url";
import { CordovaProjectHelper, ProjectType } from "../../utils/cordovaProjectHelper";
import { PlatformType } from "../cordovaDebugSession";

export class SourcemapPathTransformer {
    private _cordovaRoot: string;
    private _platform: string;
    private _webRoot: string;
    private _projectTypes: ProjectType;
    private _ionicLiveReload: boolean;
    private _debugRequestType: string;

    constructor(
        cwd: string,
        platform: PlatformType,
        projectType: ProjectType,
        debugRequestType: string,
        ionicLiveReload: boolean = false,
        address?: string,
    ) {
        this._cordovaRoot = cwd;
        this._platform = platform;
        this._webRoot = address || this._cordovaRoot;
        this._ionicLiveReload = ionicLiveReload;
        this._projectTypes = projectType;
        this._debugRequestType = debugRequestType;
    }

    public getClientPathFromFileBasedUrlWithAndroidAsset(sourceUrl: string): string | null {
        if (sourceUrl.startsWith("file:///android_asset")) {
            return this.getClientPath(sourceUrl.replace("file:///android_asset", ""));
        }
        return null;
    }

    public getClientPathFromFileBasedUrl(sourceUrl: string): string {
        const regExp = new RegExp("file:\\/\\/\\/.*\\.app(?:\\/www)*(\\/.*\\.(js|html))", "g");
        const foundStrings = regExp.exec(sourceUrl);
        if (foundStrings && foundStrings[1]) {
            return this.getClientPath(foundStrings[1]);
        }
        return this.getClientPath("/");
    }

    public getClientPathFromHttpBasedUrl(sourceUrl: string): string {
        let relativeSourcePath;
        try {
            relativeSourcePath = url.parse(sourceUrl).pathname || "/";
        } catch (err) {
            relativeSourcePath = "/";
        }
        return this.getClientPath(relativeSourcePath);
    }

    public getClientPath(relativeSourcePath: string): string {
        const wwwRoot = path.join(this._cordovaRoot, "www");

        // Given an absolute file:/// (such as from the iOS simulator) vscode-chrome-debug's
        // default behavior is to use that exact file, if it exists. We don't want that,
        // since we know that those files are copies of files in the local folder structure.
        // A simple workaround for this is to convert file:// paths to bogus http:// paths

        let defaultPath = "";
        const foldersForSearch = [this._webRoot, this._cordovaRoot, wwwRoot];

        if (this._projectTypes.ionicMajorVersion >= 4) {
            // We don't need to connect ts files with js in www folder
            // because Ionic4 `serve` and `ionic cordova run` with livereload option enabled
            // don't use www directory anymore. If www directory is fulfilled and livereload is used then
            // source maps could be messed up.
            if (
                (this._platform === PlatformType.Serve || this._ionicLiveReload) &&
                this._debugRequestType === "launch"
            ) {
                foldersForSearch.pop();
            }
        }

        // Find the mapped local file. Try looking first in the user-specified webRoot, then in the project root, and then in the www folder
        for (const searchFolder of foldersForSearch) {
            const mappedPath = this.targetUrlToClientPath(relativeSourcePath, searchFolder);

            if (mappedPath) {
                defaultPath = mappedPath;
                break;
            }
        }

        if (defaultPath.toLowerCase().indexOf(wwwRoot.toLowerCase()) === 0) {
            // If the path appears to be in www, check to see if it exists in /merges/<platform>/<relative path>
            const relativePath = path.relative(wwwRoot, defaultPath);
            const mergesPath = path.join(this._cordovaRoot, "merges", this._platform, relativePath);
            if (fs.existsSync(mergesPath)) {
                // This file is overridden by a merge: Use that one
                return mergesPath;
            }
        }
        return defaultPath;
    }

    private targetUrlToClientPath(sourceUrlPath: string, searchFolder: string): string {
        const rest = sourceUrlPath.substring(1);
        const absoluteSourcePath = rest
            ? CordovaProjectHelper.properJoin(searchFolder, rest)
            : searchFolder;

        return CordovaProjectHelper.existsSync(absoluteSourcePath) ? absoluteSourcePath : "";
    }
}
