// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { SourcemapPathTransformer } from "../sourcemapPathTransformer";
import { ProjectType } from "../../../utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../requestArgs";
import { ChromeCordovaCDPMessageHandler } from "./implementation/chromeCordovaCDPMessageHandler";
import { ChromeIonicCDPMessageHandler } from "./implementation/chromeIonicCDPMessageHandler";
import { SafariCordovaCDPMessageHandler } from "./implementation/safariCordovaCDPMessageHandler";
import { SafariIonicCDPMessageHandler } from "./implementation/safariIonicCDPMessageHandler";
import { HandlerOptions } from "./abstraction/CDPMessageHandlerBase";

export class CDPMessageHandlerCreator {
    public static generateHandlerOptions(args: ICordovaAttachRequestArgs): HandlerOptions {
        return {
            platform: args.platform,
            debugRequest: args.request,
            ionicLiveReload: args.ionicLiveReload,
            devServerAddress: args.devServerAddress,
            devServerPort: args.devServerPort,
            simulatePort: args.simulatePort,
            iOSAppPackagePath: args.iOSAppPackagePath,
            iOSVersion: args.iOSVersion,
        };
    }

    public static create(
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: ProjectType,
        args: ICordovaAttachRequestArgs,
        isChrome: boolean,
    ):
        | ChromeCordovaCDPMessageHandler
        | ChromeIonicCDPMessageHandler
        | SafariCordovaCDPMessageHandler
        | SafariIonicCDPMessageHandler {
        const handlerOptions = CDPMessageHandlerCreator.generateHandlerOptions(args);

        if (isChrome) {
            if (projectType.isIonic) {
                return new ChromeIonicCDPMessageHandler(
                    sourcemapPathTransformer,
                    projectType,
                    handlerOptions,
                );
            }
            return new ChromeCordovaCDPMessageHandler(
                sourcemapPathTransformer,
                projectType,
                handlerOptions,
            );
        }
        if (projectType.isIonic) {
            return new SafariIonicCDPMessageHandler(
                sourcemapPathTransformer,
                projectType,
                handlerOptions,
            );
        }
        return new SafariCordovaCDPMessageHandler(
            sourcemapPathTransformer,
            projectType,
            handlerOptions,
        );
    }
}
