// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {
    IProtocolCommand,
    IProtocolSuccess,
    IProtocolError,
    Connection
} from "vscode-cdp-proxy";
import { SourcemapPathTransformer } from "../sourcemapPathTransformer";
import { IProjectType } from "../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../requestArgs";

export declare type ProtocolMessage = IProtocolCommand | IProtocolSuccess | IProtocolError;

export enum DispatchDirection {
    FORWARD,
    BACK,
    CANCEL,
}

export interface ProcessedCDPMessage {
    event: ProtocolMessage;
    dispatchDirection: DispatchDirection;
    communicationPreparationsDone?: boolean;
}

export abstract class CDPMessageHandlerBase {
    protected sourcemapPathTransformer: SourcemapPathTransformer;
    protected projectType: IProjectType;
    protected applicationPortPart: string;
    protected platform: string;
    protected debugRequestType: string;
    protected applicationServerAddress: string;
    protected ionicLiveReload?: boolean;
    protected debuggerTarget: Connection | null;
    protected applicationTarget: Connection | null;

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
        this.debugRequestType = args.request;
    }

    public abstract processDebuggerCDPMessage(event: any): ProcessedCDPMessage;
    public abstract processApplicationCDPMessage(event: any): ProcessedCDPMessage;
    public abstract configureHandlerAccordingToProcessedAttachArgs(args: ICordovaAttachRequestArgs): void;

    public setDebuggerTarget(debuggerTarget: Connection | null): void {
        this.debuggerTarget = debuggerTarget;
    }

    public setApplicationTarget(applicationTarget: Connection | null): void {
        this.applicationTarget = applicationTarget;
    }
}
