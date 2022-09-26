// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as nodeChildProcess from "child_process";
import { ErrorHelper } from "../error/errorHelper";
import { InternalErrorCode } from "../error/internalErrorCode";

export interface IExecResult {
    process: nodeChildProcess.ChildProcess;
    outcome: Promise<string>;
}

export interface ISpawnResult {
    spawnedProcess: nodeChildProcess.ChildProcess;
    stdin: NodeJS.WritableStream;
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
    outcome: Promise<void>;
}

interface IExecOptions {
    cwd?: string;
    stdio?: any;
    env?: any;
    encoding?: string;
    timeout?: number;
    maxBuffer?: number;
    killSignal?: string;
}

interface ISpawnOptions {
    cwd?: string;
    stdio?: any;
    env?: any;
    detached?: boolean;
}

export class ChildProcess {
    public static ERROR_TIMEOUT_MILLISECONDS = 300;
    private childProcess: typeof nodeChildProcess;

    constructor({ childProcess = nodeChildProcess } = {}) {
        this.childProcess = childProcess;
    }

    public exec(command: string, options: IExecOptions = {}): Promise<IExecResult> {
        let outcome: Promise<string>;
        let process: nodeChildProcess.ChildProcess;
        return new Promise<IExecResult>(resolveRes => {
            outcome = new Promise<string>((resolve, reject) => {
                process = this.childProcess.exec(
                    command,
                    options,
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (error: Error, stdout: string, stderr: string) => {
                        if (error) {
                            reject(
                                ErrorHelper.getNestedError(
                                    error,
                                    InternalErrorCode.CommandFailed,
                                    command,
                                ),
                            );
                        } else {
                            resolve(stdout);
                        }
                    },
                );
            });
            resolveRes({ process, outcome });
        });
    }

    public execToString(command: string, options: IExecOptions = {}): Promise<string> {
        return this.exec(command, options).then(result =>
            result.outcome.then(stdout => stdout.toString()),
        );
    }

    public execFileSync(
        command: string,
        args: string[] = [],
        options: IExecOptions = {},
    ): Buffer | string {
        return this.childProcess.execFileSync(command, args, options);
    }

    public spawn(
        command: string,
        args: string[] = [],
        options: ISpawnOptions = {},
        showStdOutputsOnError: boolean = false,
    ): ISpawnResult {
        const spawnedProcess = this.childProcess.spawn(command, args, options);
        const outcome: Promise<void> = new Promise((resolve, reject) => {
            spawnedProcess.once("error", (error: any) => {
                reject(error);
            });

            const stderrChunks: string[] = [];
            const stdoutChunks: string[] = [];

            spawnedProcess.stderr.on("data", data => {
                stderrChunks.push(data.toString());
            });

            spawnedProcess.stdout.on("data", data => {
                stdoutChunks.push(data.toString());
            });

            spawnedProcess.once("exit", (code: number) => {
                if (code === 0) {
                    resolve();
                } else {
                    const commandWithArgs = `${command} ${args.join(" ")}`;
                    if (showStdOutputsOnError) {
                        let details = "";
                        if (stdoutChunks.length > 0) {
                            details = details.concat(
                                `\n\tSTDOUT: ${stdoutChunks[stdoutChunks.length - 1]}`,
                            );
                        }
                        if (stderrChunks.length > 0) {
                            details = details.concat(`\n\tSTDERR: ${stderrChunks.join("\n\t")}`);
                        }
                        if (details === "") {
                            details = "STDOUT and STDERR are empty!";
                        }
                        reject(
                            ErrorHelper.getInternalError(
                                InternalErrorCode.CommandFailedWithDetails,
                                commandWithArgs,
                                details,
                            ),
                        );
                    } else {
                        reject(
                            ErrorHelper.getInternalError(
                                InternalErrorCode.CommandFailed,
                                commandWithArgs,
                                code,
                            ),
                        );
                    }
                }
            });
        });
        return {
            spawnedProcess,
            stdin: spawnedProcess.stdin,
            stdout: spawnedProcess.stdout,
            stderr: spawnedProcess.stderr,
            outcome,
        };
    }
}
