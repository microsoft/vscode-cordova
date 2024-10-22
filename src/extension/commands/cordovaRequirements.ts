// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CordovaCommandHelper } from "../../utils/cordovaCommandHelper";
import { CordovaProjectHelper } from "../../utils/cordovaProjectHelper";
import { OutputChannelLogger } from "../../utils/log/outputChannelLogger";
import { commandWrapper } from "./commandUtil";
import * as child_process from "child_process";
import * as nls from "vscode-nls";

export class cordovaRequirements {
    static codeName = "cordova.requirements";
    static createHandler = async () => {
        await commandWrapper(CordovaCommandHelper.executeCordovaCommand, ["requirements"]).then(
            async () => {
                new Promise((resolve, reject) => {
                    const logger = OutputChannelLogger.getMainChannel();
                    const localize = nls.loadMessageBundle();

                    const projectRoot = __dirname;

                    const env = CordovaProjectHelper.getEnvArgument({
                        env: CordovaCommandHelper.getEnvArgs(projectRoot),
                        envFile: CordovaCommandHelper.getEnvFile(projectRoot),
                    });

                    const process = child_process.exec("npm list -g plugman --depth=0", {
                        cwd: projectRoot,
                        env,
                    });

                    logger.log(localize("Checking", "########### Checking Plugman ###########"));

                    process.stdout.on("data", (e: string) => {
                        const match = e.match(/\d+\.\d+\.\d+/);
                        logger.log(`Plugman: ${match[0]}`);
                    });
                    process.stdout.on("error", (err: any) => {
                        if (err === "exit code 1") {
                            logger.log(
                                localize(
                                    "PlugmanNotFound",
                                    "Plugman not found. Please install it globally with 'npm install -g plugman'",
                                ),
                            );
                            reject(err);
                        }
                    });
                    process.on("close", (code: number) => {
                        if (code === 0) {
                            logger.log(
                                localize(
                                    "FinishedChecking",
                                    "########### Finished Checking Plugman ###########",
                                ),
                            );
                            resolve({});
                        }
                    });
                });
            },
        );
    };
}
