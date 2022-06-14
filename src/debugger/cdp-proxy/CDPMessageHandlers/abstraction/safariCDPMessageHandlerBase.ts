// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { ProjectType } from "../../../../utils/cordovaProjectHelper";
import { CDP_API_NAMES } from "../CDPAPINames";
import { CDPMessageHandlerBase, ExecutionContext, HandlerOptions } from "./CDPMessageHandlerBase";

export abstract class SafariCDPMessageHandlerBase extends CDPMessageHandlerBase {
    protected targetId: string;
    protected isTargeted: boolean;
    protected iOSAppPackagePath: string;
    protected isBackcompatConfigured: boolean;
    protected customMessageLastId: number;

    constructor(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: ProjectType,
        options: HandlerOptions,
    ) {
        super(sourcemapPathTransformer, projectType, options);
        this.targetId = "";
        this.customMessageLastId = 0;
        this.isTargeted = true;
        this.isBackcompatConfigured = false;
    }

    protected abstract fixSourcemapLocation(reqParams: any): any;
    protected abstract fixSourcemapRegexp(reqParams: any): any;

    protected processDeprecatedConsoleMessage(event: any): any {
        return {
            method: CDP_API_NAMES.RUNTIME_CONSOLE_API_CALLED,
            params: {
                type: event.params.message.type,
                timestamp: event.params.message.timestamp,
                args: event.params.message.parameters || [
                    { type: "string", value: event.params.message.text },
                ],
                stackTrace: {
                    callFrames: event.params.message.stack || event.params.message.stackTrace,
                },
                executionContextId: 1,
            },
        };
    }

    protected wrapRequestInTargetedForm(request: any): any {
        return {
            id: request.id,
            method: CDP_API_NAMES.TARGET_SEND_MESSAGE_TO_TARGET,
            params: {
                id: request.id,
                message: JSON.stringify(request),
                targetId: this.targetId,
            },
        };
    }

    protected configureTargetForIWDPCommunication(): void {
        try {
            this.sendCustomRequestToAppTarget(CDP_API_NAMES.CONSOLE_ENABLE, {});
            this.sendCustomRequestToAppTarget(CDP_API_NAMES.DEBUGGER_SET_BREAKPOINTS_ACTIVE, {
                active: true,
            });
        } catch (err) {
            // Specifically ignore a fail here since it's only for backcompat
        }
    }

    protected configureDebuggerForIWDPCommunication(): void {
        const context: ExecutionContext = {
            id: this.customMessageLastId++,
            origin: "",
            name: "IOS Execution Context",
            auxData: {
                isDefault: true,
                type: "page",
                frameId: this.targetId,
            },
        };
        try {
            this.sendCustomRequestToDebuggerTarget(
                CDP_API_NAMES.EXECUTION_CONTEXT_CREATED,
                { context },
                false,
            );
        } catch (err) {
            throw Error("Could not create Execution context");
        }
    }

    protected sendCustomRequestToDebuggerTarget(
        method: string,
        params: any = {},
        addMessageId: boolean = true,
    ): void {
        const request: any = {
            method,
            params,
        };

        if (addMessageId) {
            request.id = this.customMessageLastId++;
        }

        this.debuggerTarget?.send(request);
    }

    protected sendCustomRequestToAppTarget(method: string, params: any = {}): void {
        let request = {
            id: this.customMessageLastId++,
            method,
            params,
        };

        if (this.isTargeted) {
            request = this.wrapRequestInTargetedForm(request);
        }

        this.applicationTarget?.send(request);
    }
}
