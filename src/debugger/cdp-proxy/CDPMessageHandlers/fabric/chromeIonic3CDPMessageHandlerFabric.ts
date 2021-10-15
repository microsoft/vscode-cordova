// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CDPMessageHandlerBaseFabric } from "./CDPMessageHandlerBaseFabric";
import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { IProjectType } from "../../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../../requestArgs";
import { ChromeIonic3CDPMessageHandler } from "../product/chromeIonic3CDPMessageHandler";

class chromeIonic3CDPMessageHandlerFabric extends CDPMessageHandlerBaseFabric {
    public create(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs
    ): ChromeIonic3CDPMessageHandler {
        return new ChromeIonic3CDPMessageHandler(sourcemapPathTransformer, projectType, args);
    }
}
