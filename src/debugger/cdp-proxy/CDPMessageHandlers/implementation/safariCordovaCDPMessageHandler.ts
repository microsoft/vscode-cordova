// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as semver from "semver";
import {
    ProcessedCDPMessage,
    DispatchDirection,
    HandlerOptions,
} from "../abstraction/CDPMessageHandlerBase";
import { SafariCDPMessageHandlerBase } from "../abstraction/safariCDPMessageHandlerBase";
import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { ProjectType } from "../../../../utils/cordovaProjectHelper";
import { CDP_API_NAMES } from "../CDPAPINames";

export class SafariCordovaCDPMessageHandler extends SafariCDPMessageHandlerBase {
    constructor(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: ProjectType,
        options: HandlerOptions,
    ) {
        super(sourcemapPathTransformer, projectType, options);
    }

    public configureHandlerAfterAttachmentPreparation(options: HandlerOptions): void {
        this.isTargeted = semver.gte(options.iOSVersion, "12.2.0");

        if (options.iOSAppPackagePath) {
            this.iOSAppPackagePath = options.iOSAppPackagePath;
        } else {
            throw new Error('".app" file isn\'t found'); // eslint-disable-line
        }
    }

    public processDebuggerCDPMessage(event: any): ProcessedCDPMessage {
        const dispatchDirection = DispatchDirection.FORWARD;
        if (event.method === CDP_API_NAMES.DEBUGGER_SET_BREAKPOINT_BY_URL) {
            event.params = this.fixSourcemapRegexp(event.params);
        }

        if (!this.isBackcompatConfigured && event.method === CDP_API_NAMES.RUNTIME_ENABLE) {
            this.configureTargetForIWDPCommunication();
            this.configureDebuggerForIWDPCommunication();
            this.isBackcompatConfigured = true;
        }

        if (this.isTargeted && !event.method.match(/^Target/)) {
            event = this.wrapRequestInTargetedForm(event);
        }

        return {
            event,
            dispatchDirection,
        };
    }

    public processApplicationCDPMessage(event: any): ProcessedCDPMessage {
        let dispatchDirection = DispatchDirection.FORWARD;
        let communicationPreparationsDone = false;

        if (this.isTargeted) {
            if (!event.method || !event.method.match(/^Target/)) {
                dispatchDirection = DispatchDirection.CANCEL;
                return {
                    event,
                    dispatchDirection,
                };
            }
            if (event.method === CDP_API_NAMES.TARGET_TARGET_CREATED) {
                this.targetId = event.params.targetInfo.targetId;
                communicationPreparationsDone = true;
            }
            if (event.method === CDP_API_NAMES.TARGET_DISPATCH_MESSAGE_FROM_TARGET) {
                event = JSON.parse(event.params.message);
            }
        }

        if (
            event.method === CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED &&
            event.params.url &&
            event.params.url.startsWith(`file://${this.iOSAppPackagePath}`)
        ) {
            event.params = this.fixSourcemapLocation(event.params);
        }

        if (event.method === CDP_API_NAMES.CONSOLE_MESSAGE_ADDED) {
            event = this.processDeprecatedConsoleMessage(event);
        }

        if (event.result && event.result.properties) {
            event.result = { result: event.result.properties };
        }

        return {
            event,
            dispatchDirection,
            communicationPreparationsDone,
        };
    }

    protected fixSourcemapLocation(reqParams: any): any {
        const absoluteSourcePath = this.sourcemapPathTransformer.getClientPathFromFileBasedUrl(
            reqParams.url,
        );

        reqParams.url = absoluteSourcePath ? `file://${absoluteSourcePath}` : "";
        return reqParams;
    }

    protected fixSourcemapRegexp(reqParams: any): any {
        const regExp = /.*\\\/www\\\/(.*\.(js|html))/g;
        const foundStrings = regExp.exec(reqParams.urlRegex);
        if (foundStrings && foundStrings[1]) {
            const uriPart = foundStrings[1].split("\\\\").join("\\/");
            const fixedRemotePath = this.iOSAppPackagePath
                .split("/")
                .join("\\/")
                .split(".")
                .join("\\.");
            reqParams.urlRegex = `file:\\/\\/${fixedRemotePath}\\/www\\/${uriPart}`;
        }
        return reqParams;
    }
}
