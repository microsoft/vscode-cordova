// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CDPMessageHandlerBaseFabric } from "./CDPMessageHandlerBaseFabric";
import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { IProjectType } from "../../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../../requestArgs";
import { SafariIonic3CDPMessageHandler } from "../product/safariIonic3CDPMessageHandler";

class safariIonic3CDPHandlerFabric extends CDPMessageHandlerBaseFabric {
    public create(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs
    ): SafariIonic3CDPMessageHandler {
        return new SafariIonic3CDPMessageHandler(sourcemapPathTransformer, projectType, args);
    }
}