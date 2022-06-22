// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { IProtocolCommand, IProtocolSuccess, IProtocolError, Connection } from "vscode-cdp-proxy";
import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { ProjectType } from "../../../../utils/cordovaProjectHelper";

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

export interface ExecutionContext {
    id: number;
    origin: string;
    name: string;
    auxData?: {
        isDefault: boolean;
        type?: "default" | "page";
        frameId?: string;
    };
}

export interface HandlerOptions {
    platform: string;
    debugRequest: string;
    ionicLiveReload?: boolean;
    devServerAddress?: string;
    devServerPort?: number;
    simulatePort?: number;
    iOSAppPackagePath?: string;
    iOSVersion?: string;
}

export abstract class CDPMessageHandlerBase {
    protected sourcemapPathTransformer: SourcemapPathTransformer;
    protected projectType: ProjectType;
    protected applicationPortPart: string;
    protected platform: string;
    protected debugRequestType: string;
    protected applicationServerAddress: string;
    protected ionicLiveReload?: boolean;
    protected debuggerTarget: Connection | null;
    protected applicationTarget: Connection | null;

    constructor(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: ProjectType,
        options: HandlerOptions,
    ) {
        this.sourcemapPathTransformer = sourcemapPathTransformer;
        this.projectType = projectType;
        // we use an application port part, which looks like ":<port>", since on debugging
        // Ionic apps we don't need a colon after "localhost" in the link
        this.applicationPortPart = "";
        this.platform = options.platform;
        this.ionicLiveReload = options.ionicLiveReload;
        this.applicationServerAddress = options.devServerAddress || "localhost";
        this.debugRequestType = options.debugRequest;
    }

    public abstract processDebuggerCDPMessage(event: any): ProcessedCDPMessage;
    public abstract processApplicationCDPMessage(event: any): ProcessedCDPMessage;
    public abstract configureHandlerAfterAttachmentPreparation(options: HandlerOptions): void;

    public setDebuggerTarget(debuggerTarget: Connection | null): void {
        this.debuggerTarget = debuggerTarget;
    }

    public setApplicationTarget(applicationTarget: Connection | null): void {
        this.applicationTarget = applicationTarget;
    }
}
