// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { DebugConsoleLogger } from "../debugger/cordovaDebugSession";
import IonicDevServer from "../utils/ionicDevServer";
import { IGeneralAttachResult } from "./platformAttachResult";
import { IGeneralLaunchResult } from "./platformLaunchResult";
import { IGeneralPlatformOptions } from "./platformOptions";

export default abstract class AbstractPlatform {
    protected projectRoot: string;
    protected runArguments: string[];
    protected IonicDevServer: IonicDevServer;

    constructor(
        protected platformOpts: IGeneralPlatformOptions,
        protected log: DebugConsoleLogger
    ) {
        this.projectRoot = platformOpts.projectRoot;
        this.runArguments = this.getRunArguments();
        this.IonicDevServer = platformOpts.ionicDevServer;
    }

    public getPlatformOpts(): IGeneralPlatformOptions {
        return this.platformOpts;
    }

    public abstract launchApp(): Promise<IGeneralLaunchResult>;

    public abstract prepareForAttach(): Promise<IGeneralAttachResult>;

    public async stopAndCleanUp(): Promise<void> {
        await this.IonicDevServer.stopAndCleanUp();
    }

    public abstract getRunArguments(): string[];

    public static getOptFromRunArgs(
        runArguments: any[],
        optName: string,
        binary: boolean = false,
    ): string | boolean | undefined {
        if (runArguments.length > 0) {
            const optIdx = runArguments.indexOf(optName);
            let result: any = undefined;

            if (optIdx > -1) {
                result = binary ? true : runArguments[optIdx + 1];
            } else {
                for (let i = 0; i < runArguments.length; i++) {
                    const arg = runArguments[i];
                    if (arg.indexOf(optName) > -1) {
                        if (binary) {
                            result = true;
                        } else {
                            const tokens = arg.split("=");
                            if (tokens.length > 1) {
                                result = tokens[1].trim();
                            } else {
                                result = undefined;
                            }
                        }
                    }
                }
            }

            // Binary parameters can either exists (e.g. be true) or be absent. You can not pass false binary parameter.
            if (binary) {
                if (result === undefined) {
                    return undefined;
                } else {
                    return true;
                }
            }

            if (result) {
                try {
                    return JSON.parse(result);
                } catch (err) {
                    // simple string value, return as is
                    return result;
                }
            }
        }

        return undefined;
    }

    public static removeRunArgument(runArguments: string[], optName: string, binary: boolean): void {
        let isComplexOpt = false;
        let optIdx = runArguments.indexOf(optName);
        if (optIdx === -1) {
            for (let i = 0; i < runArguments.length; i++) {
                if (runArguments[i].includes(optName)) {
                    optIdx = i;
                    isComplexOpt = true;
                }
            }
        }
        if (optIdx > -1) {
            if (binary || isComplexOpt) {
                runArguments.splice(optIdx, 1);
            } else {
                runArguments.splice(optIdx, 2);
            }
        }
    }

    public static setRunArgument(
        runArguments: string[],
        optName: string,
        value: string | boolean,
    ): void {
        const isBinary = typeof value === "boolean";
        let isComplexOpt = false;
        let optIdx = runArguments.indexOf(optName);
        if (optIdx === -1) {
            for (let i = 0; i < runArguments.length; i++) {
                if (runArguments[i].includes(optName)) {
                    optIdx = i;
                    isComplexOpt = true;
                }
            }
        }
        if (optIdx > -1) {
            if (isBinary && !value) {
                runArguments.splice(optIdx, 1);
            }
            if (!isBinary) {
                if (!isComplexOpt) {
                    runArguments[optIdx + 1] = value.toString();
                } else {
                    runArguments.splice(optIdx, 1, `${optName}=${value}`);
                }
            }
        } else {
            if (isBinary && value) {
                runArguments.push(optName);
            }
            if (!isBinary) {
                if (!isComplexOpt) {
                    runArguments.push(optName, value.toString());
                } else {
                    runArguments.push(`${optName}=${value}`);
                }
            }
        }
    }
}
