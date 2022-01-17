// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {
    ProcessedCDPMessage,
    DispatchDirection,
    HandlerOptions
} from "../abstraction/CDPMessageHandlerBase";
import { ChromeCDPMessageHandlerBase } from "../abstraction/chromeCDPMessageHandlerBase";
import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { ProjectType } from "../../../../utils/cordovaProjectHelper";
import { CDP_API_NAMES } from "../CDPAPINames";

export class ChromeCordovaCDPMessageHandler extends ChromeCDPMessageHandlerBase {
    private isSimulate: boolean;

    constructor(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: ProjectType,
        options: HandlerOptions
    ) {
        super(sourcemapPathTransformer, projectType, options);

        if (options.simulatePort) {
            this.applicationPortPart = `:${options.simulatePort}`;
            this.isSimulate = true;
        } else {
            this.isSimulate = false;
        }
    }

    public processDebuggerCDPMessage(event: any): ProcessedCDPMessage {
        const dispatchDirection = DispatchDirection.FORWARD;
        if (event.method === CDP_API_NAMES.DEBUGGER_SET_BREAKPOINT_BY_URL && this.isSimulate) {
            event.params = this.fixSourcemapRegexp(event.params);
        }

        return {
            event,
            dispatchDirection,
        };
    }

    public processApplicationCDPMessage(event: any): ProcessedCDPMessage {
        const dispatchDirection = DispatchDirection.FORWARD;
        if (
            event.method === CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED &&
            event.params.url &&
            this.verifySourceMapUrl(event.params.url)
        ) {
            event.params = this.fixSourcemapLocation(event.params);
        }

        return {
            event,
            dispatchDirection,
        };
    }

    protected fixSourcemapLocation(reqParams: any): any {
        let absoluteSourcePath = this.sourcemapPathTransformer.getClientPathFromHttpBasedUrl(reqParams.url);
        if (absoluteSourcePath) {
            if (process.platform === "win32") {
                reqParams.url = "file:///" + absoluteSourcePath.split("\\").join("/"); // transform to URL standard
            } else {
                reqParams.url = "file://" + absoluteSourcePath;
            }
        }
        return reqParams;
    }
}
