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

export class EnableNetworkView {
    error = ErrorHelper.getInternalError(InternalErrorCode.FailedToEnableNetworkView);
    static codeName = "cordova.enableNetworkView";
    static createHandler = async () => {
        try {
            const value = await vscode.window.showQuickPick(["on", "off"], {
                placeHolder: "Enable or disable NetworkView",
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
                    vscode.window.showInformationMessage("NetworkView has been enabled.");
                    logger.log(
                        localize(
                            "command.networkViewEnabled",
                            "NetworkView has been enabled. You can view the network requests in the Network tab of the Developer Tools.",
                        ),
                    );
                } else {
                    vscode.window.showInformationMessage("NetworkView has been disabled.");
                    logger.log(
                        localize("command.networkViewDisabled", "NetworkView has been disabled."),
                    );
                }
            } else {
                vscode.window.showWarningMessage("No option selected for NetworkView.");
                logger.log(localize("noOptionSelected", "No option selected for NetworkView."));
            }
        } catch (error) {
            vscode.window.showErrorMessage(
                localize(
                    "command.enableNetworkViewError",
                    "Failed to enable NetworkView: {0}",
                    error,
                ),
            );
            throw ErrorHelper.getInternalError(InternalErrorCode.FailedToEnableNetworkView);
        }
    };
}
