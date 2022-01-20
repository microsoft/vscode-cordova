// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as url from "url";
import {
    ProcessedCDPMessage,
    DispatchDirection,
    HandlerOptions
} from "../abstraction/CDPMessageHandlerBase";
import { ChromeCDPMessageHandlerBase } from "../abstraction/chromeCDPMessageHandlerBase";
import { SourcemapPathTransformer } from "../../sourcemapPathTransformer";
import { ProjectType } from "../../../../utils/cordovaProjectHelper";
import { CDP_API_NAMES } from "../CDPAPINames";
import { PlatformType } from "../../../cordovaDebugSession";

export class ChromeIonicCDPMessageHandler extends ChromeCDPMessageHandlerBase {
    constructor(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: ProjectType,
        options: HandlerOptions
    ) {
        super(sourcemapPathTransformer, projectType, options);

        if (options.platform === PlatformType.Serve || options.ionicLiveReload) {
            this.applicationPortPart = options.devServerPort ? `:${options.devServerPort}` : "";
        }
        if (options.simulatePort) {
            this.applicationPortPart = `:${options.simulatePort}`;
        }
    }

    public processDebuggerCDPMessage(event: any): ProcessedCDPMessage {
        const dispatchDirection = DispatchDirection.FORWARD;
        if (event.method === CDP_API_NAMES.DEBUGGER_SET_BREAKPOINT_BY_URL) {
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
            this.tryToGetIonicDevServerPortFromURL(event.params.url);
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
        } else if (!(this.platform === PlatformType.Serve || (this.ionicLiveReload && this.debugRequestType === "launch"))) {
            reqParams.url = "";
        }
        return reqParams;
    }

    private tryToGetIonicDevServerPortFromURL(sourceURL: string) {
        if (this.ionicLiveReload && !this.applicationPortPart) {
            try {
                const devServerPort = url.parse(sourceURL).port;
                if (devServerPort) {
                    this.applicationPortPart = `:${devServerPort}`;
                }
            } catch {
                // do nothing, try to check another URL
            }
        }
    }
}
