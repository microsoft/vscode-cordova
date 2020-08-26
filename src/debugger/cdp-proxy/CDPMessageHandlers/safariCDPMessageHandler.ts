// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as url from "url";
import * as semver from "semver";
import { CDPMessageHandlerBase, ProcessedCDPMessage, DispatchDirection } from "./CDPMessageHandlerBase";
import { CDP_API_NAMES } from "./CDPAPINames";
import { SourcemapPathTransformer } from "../sourcemapPathTransformer";
import { IProjectType } from "../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../requestArgs";
import { CordovaProjectHelper } from "../../../utils/cordovaProjectHelper";

export class SafariCDPMessageHandler extends CDPMessageHandlerBase {
    private targetId: string;
    private isIonicProject: boolean;
    private isTargeted: boolean;
    private iOSAppPackagePath: string;
    private isBackcompatConfigured: boolean;

    constructor(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs
    ) {
        super(sourcemapPathTransformer, projectType, args);
        this.targetId = "";
        this.isTargeted = true;
        this.isBackcompatConfigured = false;
        this.isIonicProject = CordovaProjectHelper.isIonicAngularProjectByProjectType(projectType);

        if (args.ionicLiveReload) {
            this.applicationPortPart = args.devServerPort ? `:${args.devServerPort}` : "";
        }
    }

    public configureHandlerAfterAttachment(args: ICordovaAttachRequestArgs) {
        this.isTargeted = !!(this.isIonicProject && semver.gte(args.iOSVersion, "12.2.0"));
        if (!this.isIonicProject) {
            if (args.iOSAppPackagePath) {
                this.iOSAppPackagePath = args.iOSAppPackagePath;
            } else {
                throw new Error("\".app\" file isn't found");
            }
        }
        if (args.devServerAddress) {
            this.applicationServerAddress = args.devServerAddress;
        }
    }

    public processDebuggerCDPMessage(event: any): ProcessedCDPMessage {
        let dispatchDirection = DispatchDirection.FORWARD;
        if (event.method === CDP_API_NAMES.DEBUGGER_SET_BREAKPOINT_BY_URL) {
            event.params = this.fixSourcemapRegexp(event.params);
        }

        if (this.isTargeted && !event.method.match(/^Target/)) {
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
        
        if (!this.isBackcompatConfigured && event.method === CDP_API_NAMES.RUNTIME_ENABLE) {
            this.configureTargetForIWDPCommunication();
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

        if (event.method === CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED && event.params.url) {
            this.tryToGetIonicDevServerConnectionDataFromURL(event.params.url);
            if (
                event.params.url.startsWith(`ionic://${this.applicationServerAddress}`)
                || event.params.url.startsWith(`http://${this.applicationServerAddress}`)
                || event.params.url.startsWith(`file://${this.iOSAppPackagePath}`)
            ) {
                event.params = this.fixSourcemapLocation(event.params);
            }
        }

        if (event.method === CDP_API_NAMES.CONSOLE_MESSAGE_ADDED) {
            event = this.processDeprecatedConsoleMessage(event);
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
        let absoluteSourcePath;
        if (this.isIonicProject) {
            absoluteSourcePath = this.sourcemapPathTransformer.getClientPathFromHttpBasedUrl(reqParams.url);
        } else {
            absoluteSourcePath = this.sourcemapPathTransformer.getClientPathFromFileBasedUrl(reqParams.url);
        }

        if (absoluteSourcePath) {
            reqParams.url = "file://" + absoluteSourcePath;
        } else if (!(this.ionicLiveReload && this.debugRequestType === "launch")) {
            reqParams.url = "";
        }
        return reqParams;
    }

    private fixSourcemapRegexp(reqParams: any): any {
        const regExp = /.*\\\/www\\\/(.*\.(js|html))/g;
        let foundStrings = regExp.exec(reqParams.urlRegex);
        if (foundStrings && foundStrings[1]) {
            const uriPart = foundStrings[1].split("\\\\").join("\\/");
            if (this.isIonicProject) {
                reqParams.urlRegex = (this.ionicLiveReload ? "http"  : "ionic") +
                `:\\/\\/${this.applicationServerAddress}${this.applicationPortPart}\\/${uriPart}`;
            } else {
                const fixedRemotePath = (this.iOSAppPackagePath.split("\/").join("\\/")).split(".").join("\\.");
                reqParams.urlRegex = `file:\\/\\/${fixedRemotePath}\\/www\\/${uriPart}`;
            }
        }
        return reqParams;
    }

    private tryToGetIonicDevServerConnectionDataFromURL(sourceURL: string) {
        if (this.ionicLiveReload && !this.applicationPortPart) {
            try {
                const parsedURL = url.parse(sourceURL);
                this.applicationPortPart = parsedURL.port ? `:${parsedURL.port}` : "";
                if (parsedURL.hostname) {
                    this.applicationServerAddress = parsedURL.hostname;
                }
            } catch (err) {
                // do nothing, try to check another URL
            }
        }
    }

    private processDeprecatedConsoleMessage(event: any) {
        return {
            method: CDP_API_NAMES.RUNTIME_CONSOLE_API_CALLED,
            params: {
                type: event.params.message.type,
                timestamp: event.params.message.timestamp,
                args: event.params.message.parameters || [{ type: "string", value: event.params.message.text }],
                stackTrace: { callFrames: event.params.message.stack || event.params.message.stackTrace },
                executionContextId: 1,
            },
        };
    }

    private configureTargetForIWDPCommunication(): void {
        this.isBackcompatConfigured = true;
        this.applicationTarget?.api.Console.enable({});
        this.applicationTarget?.api.Debugger.setBreakpointsActive({ active: true });
    }
}
