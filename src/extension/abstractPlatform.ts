// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as fs from "fs";
import { DebugConsoleLogger } from "../debugger/cordovaDebugSession1";
import IonicDevServerHelper from "../utils/ionicDevServerHelper";
import { IGeneralAttachOptions } from "./platformAttachOptions";
import { IGeneralPlatformOptions } from "./platformOptions";

export default abstract class AbstractPlatform {
    protected projectRoot: string;
    protected runArguments: string[];
    protected ionicDevServerHelper: IonicDevServerHelper;

    constructor(
        protected platformOpts: IGeneralPlatformOptions,
        protected log: DebugConsoleLogger
    ) {
        this.projectRoot = platformOpts.projectRoot;
        this.runArguments = this.getRunArguments();
        this.ionicDevServerHelper = platformOpts.ionicDevServerHelper;
    }

    public getPlatformOpts(): IGeneralPlatformOptions {
        return this.platformOpts;
    }

    public abstract launchApp(
    ): Promise<void>;

    public abstract prepareForAttach(
    ): Promise<IGeneralAttachOptions>;

    public abstract stopAndCleanUp(): Promise<void>;

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

    protected static getEnvArgument(processEnv: any, env?: any, envFile?: string): any {
        let modifyEnv = Object.assign({}, processEnv);

        if (envFile) {
            // .env variables never overwrite existing variables
            const argsFromEnvFile = this.readEnvFile(envFile);
            if (argsFromEnvFile != null) {
                for (let key in argsFromEnvFile) {
                    if (!modifyEnv[key] && argsFromEnvFile.hasOwnProperty(key)) {
                        modifyEnv[key] = argsFromEnvFile[key];
                    }
                }
            }
        }

        if (env) {
            // launch config env vars overwrite .env vars
            for (let key in env) {
                if (env.hasOwnProperty(key)) {
                    modifyEnv[key] = env[key];
                }
            }
        }
        return modifyEnv;
    }

    private static readEnvFile(filePath: string): any {
        if (fs.existsSync(filePath)) {
            let buffer = fs.readFileSync(filePath, "utf8");
            let result = {};

            // Strip BOM
            if (buffer && buffer[0] === "\uFEFF") {
                buffer = buffer.substr(1);
            }

            buffer.split("\n").forEach((line: string) => {
                const r = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
                if (r !== null) {
                    const key = r[1];
                    let value = r[2] || "";
                    if (
                        value.length > 0 &&
                        value.charAt(0) === "\"" &&
                        value.charAt(value.length - 1) === "\""
                    ) {
                        value = value.replace(/\\n/gm, "\n");
                    }
                    result[key] = value.replace(/(^['"]|['"]$)/g, "");
                }
            });

            return result;
        } else {
            return null;
        }
    }
}
