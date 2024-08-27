// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.
import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import { window } from "vscode";

export class CordovaAndroidEnvironmentHelper {
    public static checkEnvironment(cwd: string, env: any, logger: any): Promise<void> {
        logger.log("Requirements check results for android:");
        return Promise.all([checkJava(cwd, env), checkAndroidSDK(cwd, env), checkGradle(cwd, env)])
            .then(() => {
                logger.log("Environment checks completed.");
            })
            .catch(err => {
                window.showErrorMessage("Environment checks failed: {0}", err.message);
            });

        function checkJava(cwd: string, env: any): Promise<void> {
            return new Promise((resolve, reject) => {
                child_process.exec("java -version", { cwd, env }, (error, stdout, stderr) => {
                    if (error) {
                        logger.log("Java JDK not found:", stderr);
                        return reject(error);
                    }
                    logger.log(`Java JDK: ${stderr.match(/version "([\d.]+)"/)[1]}`);
                    resolve();
                });
            });
        }

        function checkAndroidSDK(cwd: string, env: any): Promise<void> {
            return new Promise((resolve, reject) => {
                const sdkPath = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;

                child_process.exec(
                    `${sdkPath}/cmdline-tools/latest/bin/sdkmanager --version`,
                    { cwd, env },
                    (error, stdout, stderr) => {
                        if (error) {
                            logger.log(`Android SDK not found: ${stderr}`);
                        }
                        logger.log(`Android SDK: ${stdout.trim()}`);

                        const platformsDir = path.join(sdkPath, "platforms");
                        if (fs.existsSync(platformsDir)) {
                            const platforms = fs.readdirSync(platformsDir);
                            if (platforms.length > 0) {
                                logger.log(`Android Targets Installed: ${platforms}`);
                            } else {
                                logger.log("No Android Targets Installed.");
                            }
                        } else {
                            logger.log("Android SDK platforms directory not found.");
                        }
                        resolve();
                    },
                );
            });
        }

        function checkGradle(cwd: string, env: any): Promise<void> {
            return new Promise((resolve, reject) => {
                child_process.exec("gradle -v", { cwd, env }, (error, stdout, stderr) => {
                    if (error) {
                        logger.log(`Gradle not found: ${stderr}`);
                        return reject(error);
                    }
                    logger.log(`Gradle: ${stdout.match(/Gradle (\d+\.\d+(\.\d+)?)/)[1]}`);
                    resolve();
                });
            });
        }
    }
}
