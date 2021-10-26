// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as semver from "semver";
import { ProcessedCDPMessage, DispatchDirection } from "../abstraction/CDPMessageHandlerBase";
import { SafariCDPMessageHandlerBase } from "../abstraction/safariCDPMessageHandlerBase";
import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { IProjectType } from "../../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../../requestArgs";
import { CDP_API_NAMES } from "../CDPAPINames";

export class SafariIonicCDPMessageHandler extends SafariCDPMessageHandlerBase {
    private readonly Ionic3EvaluateErrorMessage;

    constructor(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs
    ) {
        super(sourcemapPathTransformer, projectType, args);
        this.Ionic3EvaluateErrorMessage = "process not defined";

        if (args.ionicLiveReload) {
            this.applicationPortPart = args.devServerPort ? `:${args.devServerPort}` : "";
        }
    }

    public configureHandlerAccordingToProcessedAttachArgs(args: ICordovaAttachRequestArgs): void {
        this.isTargeted = semver.gte(args.iOSVersion, "12.2.0");

        if (args.devServerAddress) {
            this.applicationServerAddress = args.devServerAddress;
        }
    }

    public processDebuggerCDPMessage(event: any): ProcessedCDPMessage {
        let dispatchDirection = DispatchDirection.FORWARD;
        if (event.method === CDP_API_NAMES.DEBUGGER_SET_BREAKPOINT_BY_URL && !this.ionicLiveReload) {
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
            event.method === CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED && event.params.url
            && (
                event.params.url.startsWith(`ionic://${this.applicationServerAddress}`)
                || event.params.url.startsWith(`file://${this.iOSAppPackagePath}`)
            )
        ) {
            event.params = this.fixSourcemapLocation(event.params);
        }

        if (event.method === CDP_API_NAMES.CONSOLE_MESSAGE_ADDED) {
            event = this.processDeprecatedConsoleMessage(event);
        }

        if (event.result) {
            if (event.result.properties) {
                event.result = { result: event.result.properties };
            }
            this.fixIonic3RuntimeEvaluateErrorResponse(event);
        }

        return {
            event,
            dispatchDirection,
            communicationPreparationsDone,
        };
    }

    protected fixSourcemapLocation(reqParams: any): any {
        let absoluteSourcePath = this.sourcemapPathTransformer.getClientPathFromHttpBasedUrl(reqParams.url);

        if (absoluteSourcePath) {
            reqParams.url = "file://" + absoluteSourcePath;
        } else if (!(this.ionicLiveReload && this.debugRequestType === "launch")) {
            reqParams.url = "";
        }
        return reqParams;
    }

    protected fixSourcemapRegexp(reqParams: any): any {
        const regExp = /.*\\\/www\\\/(.*\.(js|html))/g;
        let foundStrings = regExp.exec(reqParams.urlRegex);
        if (foundStrings && foundStrings[1]) {
            const uriPart = foundStrings[1].split("\\\\").join("\\/");
            reqParams.urlRegex = `ionic:\\/\\/${this.applicationServerAddress}${this.applicationPortPart}\\/${uriPart}`;
        }
        return reqParams;
    }

    // Js-debug expected empty value or an object, but the target returns a string. This leads to infinite sending of
    // Runtime.Evaluate requests from the debugger to the target.
    private fixIonic3RuntimeEvaluateErrorResponse(event: any) {
        if (event.result.result && event.result.result.value === this.Ionic3EvaluateErrorMessage) {
            delete event.result.result.value;
        }
    }
}
