// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { ProjectType } from "../../../../utils/cordovaProjectHelper";
import { CDPMessageHandlerBase, HandlerOptions } from "./CDPMessageHandlerBase";

export abstract class ChromeCDPMessageHandlerBase extends CDPMessageHandlerBase {
    protected sourcemapsProtocol?: string;

    constructor(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: ProjectType,
        options: HandlerOptions,
    ) {
        super(sourcemapPathTransformer, projectType, options);
    }

    public configureHandlerAfterAttachmentPreparation(options: HandlerOptions): void {}

    protected abstract fixSourcemapLocation(reqParams: any, androidAssetURL?: boolean): any;

    protected fixSourcemapRegexp(reqParams: any): any {
        const regExp =
            process.platform === "win32"
                ? /.*\\{2}(?:\[wW]){3}\\{2}(.*?\\.\[jJ]\[sS])/g
                : /.*\\\/www\\\/(.*?\.js)/g;
        const foundStrings = regExp.exec(reqParams.urlRegex);
        if (foundStrings && foundStrings[1]) {
            const uriPart = foundStrings[1].split("\\\\").join("\\/");
            reqParams.urlRegex = `${this.sourcemapsProtocol || "https?"}:\\/\\/${
                this.applicationServerAddress
            }${this.applicationPortPart}\\/${uriPart}`;
        }
        return reqParams;
    }

    protected verifySourceMapUrl(url: string): boolean {
        const urlRegExp = new RegExp(`^(https?):\/\/${this.applicationServerAddress}`);
        if (!this.sourcemapsProtocol) {
            const matchRes = url.match(urlRegExp);
            if (matchRes && matchRes[1]) {
                this.sourcemapsProtocol = matchRes[1];
                return true;
            }
            return false;
        }
        return urlRegExp.test(url);
    }
}
