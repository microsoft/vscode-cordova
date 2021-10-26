// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CDPMessageHandlerBase } from "./CDPMessageHandlerBase";
import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { IProjectType } from "../../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../../requestArgs";

export abstract class ChromeCDPMessageHandlerBase extends CDPMessageHandlerBase {
    constructor(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs
    ) {
        super(sourcemapPathTransformer, projectType, args);
    }

    public configureHandlerAccordingToProcessedAttachArgs(args: ICordovaAttachRequestArgs): void {}

    protected abstract fixSourcemapLocation(reqParams: any): any;

    protected fixSourcemapRegexp(reqParams: any): any {
        const regExp = process.platform === "win32" ?
            /.*\\\\\[wW\]\[wW\]\[wW\]\\\\(.*\\.\[jJ\]\[sS\])/g :
            /.*\\\/www\\\/(.*\.js)/g;
        let foundStrings = regExp.exec(reqParams.urlRegex);
        if (foundStrings && foundStrings[1]) {
            const uriPart = foundStrings[1].split("\\\\").join("\\/");
            reqParams.urlRegex = `http:\\/\\/${this.applicationServerAddress}${this.applicationPortPart}\\/${uriPart}`;
        }
        return reqParams;
    }
}