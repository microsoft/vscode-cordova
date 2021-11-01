// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { SourcemapPathTransformer } from "../sourcemapPathTransformer";
import { IProjectType } from "../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../requestArgs";
import { ChromeCordovaCDPMessageHandler } from "./implementation/chromeCordovaCDPMessageHandler";
import { ChromeIonicCDPMessageHandler } from "./implementation/chromeIonicCDPMessageHandler";
import { SafariCordovaCDPMessageHandler } from "./implementation/safariCordovaCDPMessageHandler";
import { SafariIonicCDPMessageHandler } from "./implementation/safariIonicCDPMessageHandler";
import { CordovaProjectHelper } from "../../../utils/cordovaProjectHelper";
import { HandlerOptions } from "./abstraction/CDPMessageHandlerBase";

export class CDPMessageHandlerCreator {
    public static generateHandlerOptions(args: ICordovaAttachRequestArgs): HandlerOptions {
        return ({
            platform: args.platform,
            debugRequest: args.request,
            ionicLiveReload: args.ionicLiveReload,
            devServerAddress: args.devServerAddress,
            devServerPort: args.devServerPort,
            simulatePort: args.simulatePort,
            iOSAppPackagePath: args.iOSAppPackagePath,
            iOSVersion: args.iOSVersion,
        });
    }

    public static create(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs,
        isChrome: boolean
    ): ChromeCordovaCDPMessageHandler | ChromeIonicCDPMessageHandler | SafariCordovaCDPMessageHandler | SafariIonicCDPMessageHandler {
        const isIonicProject = CordovaProjectHelper.isIonicAngularProjectByProjectType(projectType);
        const handlerOptions = CDPMessageHandlerCreator.generateHandlerOptions(args);

        if (isChrome) {
            if (isIonicProject) {
                return new ChromeIonicCDPMessageHandler(sourcemapPathTransformer, projectType, handlerOptions);
            } else {
                return new ChromeCordovaCDPMessageHandler(sourcemapPathTransformer, projectType, handlerOptions);
            }
        } else {
            if (isIonicProject) {
                return new SafariIonicCDPMessageHandler(sourcemapPathTransformer, projectType, handlerOptions);
            } else {
                return new SafariCordovaCDPMessageHandler(sourcemapPathTransformer, projectType, handlerOptions);
            }
        }
    }
}
