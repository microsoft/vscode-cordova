// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CDPMessageHandlerBaseCreator } from "./CDPMessageHandlerBaseCreator";
import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { IProjectType } from "../../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../../requestArgs";
import { ChromeCordovaCDPMessageHandler } from "../products/chromeCordovaCDPMessageHandler";
import { ChromeIonic3CDPMessageHandler } from "../products/chromeIonic3CDPMessageHandler";
import { CordovaProjectHelper } from "../../../../utils/cordovaProjectHelper";

class chromeCordovaCDPMessageHandlerCreator extends CDPMessageHandlerBaseCreator {
    public create(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs
    ): ChromeCordovaCDPMessageHandler | ChromeIonic3CDPMessageHandler {
        const isIonicProject = CordovaProjectHelper.isIonicAngularProjectByProjectType(projectType);

        if (isIonicProject) {
            return new ChromeIonic3CDPMessageHandler(sourcemapPathTransformer, projectType, args);
        }
        return new ChromeCordovaCDPMessageHandler(sourcemapPathTransformer, projectType, args);
    }
}
