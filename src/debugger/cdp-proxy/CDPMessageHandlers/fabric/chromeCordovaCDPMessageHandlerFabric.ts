// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CDPMessageHandlerBaseFabric } from "./CDPMessageHandlerBaseFabric";
import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { IProjectType } from "../../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../../requestArgs";
import { ChromeCordovaCDPMessageHandler } from "../product/chromeCordovaCDPMessageHandler";

class chromeCordovaCDPMessageHandlerFabric extends CDPMessageHandlerBaseFabric {
    public create(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs
    ): ChromeCordovaCDPMessageHandler {
        return new ChromeCordovaCDPMessageHandler(sourcemapPathTransformer, projectType, args);
    }
}
