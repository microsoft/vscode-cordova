// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {
    IProtocolCommand,
    IProtocolSuccess,
    IProtocolError
} from "vscode-cdp-proxy";
import { SourcemapPathTransformer } from "../sourcemapPathTransformer";
import { IProjectType } from "../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../requestArgs";

export declare type ProtocolMessage = IProtocolCommand | IProtocolSuccess | IProtocolError;

export interface ProcessedCDPMessage {
    event: ProtocolMessage;
    sendBack: boolean;
}

export abstract class CDPMessageHandlerBase {
    protected sourcemapPathTransformer: SourcemapPathTransformer;
    protected projectType: IProjectType;
    protected applicationPortPart: string;
    protected platform: string;
    protected applicationServerAddress: string;
    protected ionicLiveReload?: boolean;

    constructor(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs
    ) {
        this.sourcemapPathTransformer = sourcemapPathTransformer;
        this.projectType = projectType;
        // we use an application port part, which looks like ":<port>", since on debugging
        // Ionic apps we don't need a colon after "localhost" in the link
        this.applicationPortPart = "";
        this.platform = args.platform;
        this.ionicLiveReload = args.ionicLiveReload;
        this.applicationServerAddress = args.devServerAddress || "localhost";
    }

    public abstract processDebuggerCDPMessage(event: any): ProcessedCDPMessage;
    public abstract processApplicationCDPMessage(event: any): ProcessedCDPMessage;
}
