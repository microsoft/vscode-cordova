// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CDPMessageHandlerBase, ProcessedCDPMessage } from "./CDPMessageHandlerBase";
import { SourcemapPathTransformer } from "../sourcemapPathTransformer";
import { IProjectType } from "../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../requestArgs";

export class TargetedCDPMessageHandler extends CDPMessageHandlerBase {
    constructor(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs
    ) {
        super(sourcemapPathTransformer, projectType, args);
    }

    public processDebuggerCDPMessage(event: any): ProcessedCDPMessage {
        let sendBack = false;

        return {
            event,
            sendBack,
        };
    }

    public processApplicationCDPMessage(event: any): ProcessedCDPMessage {
        let sendBack = false;

        return {
            event,
            sendBack,
        };
    }
}
