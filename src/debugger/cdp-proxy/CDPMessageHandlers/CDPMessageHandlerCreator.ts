// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { SourcemapPathTransformer } from "../sourcemapPathTransformer";
import { IProjectType } from "../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../requestArgs";
import { ChromeCordovaCDPMessageHandler } from "./implementation/chromeCordovaCDPMessageHandler";
import { ChromeIonicCDPMessageHandler } from "./implementation/chromeIonicCDPMessageHandler";
import { SafariCordovaCDPMessageHandler } from "./implementation/safariCordovaCDPMessageHandler";
import { SafariIonicCDPMessageHandler } from "./implementation/safariIonicCDPMessageHandler";
import { CordovaProjectHelper } from "../../../utils/cordovaProjectHelper";

export class CDPMessageHandlerCreator {
    public static create(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs,
        isChrome: boolean
    ): ChromeCordovaCDPMessageHandler | ChromeIonicCDPMessageHandler | SafariCordovaCDPMessageHandler | SafariIonicCDPMessageHandler {
        const isIonicProject = CordovaProjectHelper.isIonicAngularProjectByProjectType(projectType);

        if (isChrome) {
            if (isIonicProject) {
                return new ChromeIonicCDPMessageHandler(sourcemapPathTransformer, projectType, args);
            } else {
                return new ChromeCordovaCDPMessageHandler(sourcemapPathTransformer, projectType, args);
            }
        } else {
            if (isIonicProject) {
                return new SafariIonicCDPMessageHandler(sourcemapPathTransformer, projectType, args);
            } else {
                return new SafariCordovaCDPMessageHandler(sourcemapPathTransformer, projectType, args);
            }
        }
    }
}
