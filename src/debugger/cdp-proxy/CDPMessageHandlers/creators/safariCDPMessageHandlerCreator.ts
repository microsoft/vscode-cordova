// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CDPMessageHandlerBaseCreator } from "./CDPMessageHandlerBaseCreator";
import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { IProjectType } from "../../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../../requestArgs";
import { SafariCordovaCDPMessageHandler } from "../products/safariCordovaCDPMessageHandler";
import { SafariIonic3CDPMessageHandler } from "../products/safariIonic3CDPMessageHandler";
import { CordovaProjectHelper } from "../../../../utils/cordovaProjectHelper";

export class SafariCDPMessageHandlerCreator extends CDPMessageHandlerBaseCreator {
    public create(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs
    ): SafariCordovaCDPMessageHandler | SafariIonic3CDPMessageHandler {
        const isIonicProject = CordovaProjectHelper.isIonicAngularProjectByProjectType(projectType);

        if (isIonicProject) {
            return new SafariIonic3CDPMessageHandler(sourcemapPathTransformer, projectType, args);
        }
        return new SafariCordovaCDPMessageHandler(sourcemapPathTransformer, projectType, args);
    }
}
