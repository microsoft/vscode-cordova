// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { ErrorHelper } from "../../common/error/errorHelper";
import { InternalErrorCode } from "../../common/error/internalErrorCode";
import { OutputChannelLogger } from "../../utils/log/outputChannelLogger";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();
const logger = OutputChannelLogger.getMainChannel();

export class NetworkView {
    error = ErrorHelper.getInternalError(InternalErrorCode.FailedToEnableNetworkView);
    static codeName = "cordova.networkView";
    static createHandler = async () => {
        try {
            const value = await vscode.window.showQuickPick(["On", "Off"], {
                placeHolder: localize(
                    "cordova.networkView.command.placeholder",
                    "Enable or disable Network View.",
                ),
            });

            if (value) {
                const config = vscode.workspace.getConfiguration("debug.javascript");
                // Update the configuration setting for NetworkView
                // This will enable or disable the NetworkView feature in the JavaScript debugger
                await config.update(
                    "enableNetworkView",
                    value === "on",
                    vscode.ConfigurationTarget.Global,
                );

                if (value === "on") {
                    vscode.window.showInformationMessage(
                        localize(
                            "cordova.networkView.command.enabled",
                            "Network View has been enabled. You can view the network requests in the Network tab of the Developer Tools.",
                        ),
                    );
                    logger.log(
                        localize(
                            "cordova.networkView.command.enabled",
                            "Network View has been enabled. You can view the network requests in the Network tab of the Developer Tools.",
                        ),
                    );
                } else {
                    vscode.window.showInformationMessage(
                        localize(
                            "cordova.networkView.command.disabled",
                            "Network View has been disabled.",
                        ),
                    );
                    logger.log(
                        localize(
                            "cordova.networkView.command.disabled",
                            "Network View has been disabled.",
                        ),
                    );
                }
            } else {
                vscode.window.showWarningMessage(
                    localize(
                        "cordova.networkView.command.noOptionSelected",
                        "No option selected for Network View.",
                    ),
                );
                logger.log(
                    localize(
                        "cordova.networkView.command.noOptionSelected",
                        "No option selected for Network View.",
                    ),
                );
            }
        } catch (error) {
            vscode.window.showErrorMessage(
                localize(
                    "cordova.networkView.command.error.failedToEnable",
                    "Failed to enable Network View: {0}",
                    error,
                ),
            );
            logger.log(
                localize(
                    "cordova.networkView.command.error.failedToEnable",
                    "Failed to enable Network View: {0}",
                    error,
                ),
            );
            throw ErrorHelper.getInternalError(InternalErrorCode.FailedToEnableNetworkView);
        }
    };
}
