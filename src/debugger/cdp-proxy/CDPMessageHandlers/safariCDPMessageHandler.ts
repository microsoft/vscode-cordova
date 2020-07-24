// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CDPMessageHandlerBase, ProcessedCDPMessage, DispatchDirection } from "./CDPMessageHandlerBase";
import { CDP_API_NAMES } from "./CDPAPINames";
import { SourcemapPathTransformer } from "../sourcemapPathTransformer";
import { IProjectType } from "../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../requestArgs";
import { CordovaProjectHelper } from "../../../utils/cordovaProjectHelper";

export class SafariCDPMessageHandler extends CDPMessageHandlerBase {
    private targetId: string;

    constructor(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs
    ) {
        super(sourcemapPathTransformer, projectType, args);
        this.targetId = "";
    }

    public processDebuggerCDPMessage(event: any): ProcessedCDPMessage {
        let dispatchDirection = DispatchDirection.FORWARD;
        if (
            event.method === CDP_API_NAMES.DEBUGGER_SET_BREAKPOINT_BY_URL
            && CordovaProjectHelper.isIonicAngularProjectByProjectType(this.projectType)
        ) {
            event.params = this.fixIonicSourcemapRegexp(event.params);
        }
        if (!event.method.match(/^Target/)) {
            event = {
                id: event.id,
                method: CDP_API_NAMES.TARGET_SEND_MESSAGE_TO_TARGET,
                params: {
                    id: event.id,
                    message: JSON.stringify(event),
                    targetId: this.targetId,
                },
            };
        }

        return {
            event,
            dispatchDirection,
        };
    }

    public processApplicationCDPMessage(event: any): ProcessedCDPMessage {
        let dispatchDirection = DispatchDirection.FORWARD;
        let communicationPreparationsDone = undefined;
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
        if (
            event.method === CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED
            && event.params.url
            && event.params.url.startsWith(`ionic://${this.applicationServerAddress}`)
        ) {
            event.params = this.fixSourcemapLocation(event.params);
        }
        if (event.result && event.result.properties) {
            event.result = { result: event.result.properties};
        }

        return {
            event,
            dispatchDirection,
            communicationPreparationsDone,
        };
    }

    private fixSourcemapLocation(reqParams: any): any {
        let absoluteSourcePath = this.sourcemapPathTransformer.getClientPath(reqParams.url);
        if (absoluteSourcePath) {
            reqParams.url = "file://" + absoluteSourcePath;
        } else if (!this.ionicLiveReload) {
            reqParams.url = "";
        }
        return reqParams;
    }

    private fixIonicSourcemapRegexp(reqParams: any): any {
        const regExp = /.*\\\/www\\\/(.*\.js)/g;
        let foundStrings = regExp.exec(reqParams.urlRegex);
        if (foundStrings && foundStrings[1]) {
            const uriPart = foundStrings[1].split("\\\\").join("\\/");
            reqParams.urlRegex = `ionic:\\/\\/${this.applicationServerAddress}${this.applicationPortPart}\\/${uriPart}`;
        }
        return reqParams;
    }
}
