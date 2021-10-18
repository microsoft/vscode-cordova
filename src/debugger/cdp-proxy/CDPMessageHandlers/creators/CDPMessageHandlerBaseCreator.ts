// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { IProjectType } from "../../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../../requestArgs";
import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { CDPMessageHandlerBase } from "../products/CDPMessageHandlerBase";

export abstract class CDPMessageHandlerBaseCreator {
    public abstract create(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs
    ): CDPMessageHandlerBase;
}
