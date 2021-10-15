// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { IProjectType } from "../../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../../requestArgs";
import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { CDPMessageHandlerBase } from "../product/CDPMessageHandlerBase";

export abstract class CDPMessageHandlerBaseFabric {
    public abstract create(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs
    ): CDPMessageHandlerBase;
}