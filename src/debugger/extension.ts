// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as child_process from "child_process";
import * as path from "path";
import * as nls from "vscode-nls";
import { CordovaProjectHelper } from "../utils/cordovaProjectHelper";
import { findFileInFolderHierarchy } from "../utils/extensionHelper";
import { DebugConsoleLogger } from "./cordovaDebugSession";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

// suppress the following strings because they are not actual errors:
const errorsToSuppress = [
    "Run an Ionic project on a connected device",
    "Error: Unhandled error. ('[ios-sim] Simulator already running.\\n')",
];

export function execCommand(
    command: string,
    args: string[],
    errorLogger: (message: string) => void,
): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const proc = child_process.spawn(command, args, { stdio: "pipe", shell: true });
        let stderr = "";
        let stdout = "";
        proc.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
        });
        proc.stdout.on("data", (data: Buffer) => {
            stdout += data.toString();
        });
        proc.on("error", (err: Error) => {
            reject(err);
        });
        proc.on("close", (code: number) => {
            if (code !== 0) {
                errorLogger(stderr);
                errorLogger(stdout);
                reject(
                    new Error(
                        localize(
                            "ErrorRunningCommand",
                            "Error running {0} {1}",
                            command,
                            args.join(" "),
                        ),
                    ),
                );
            }
            resolve(stdout);
        });
    });
}

export function cordovaRunCommand(
    command: string,
    args: string[],
    env,
    cordovaRootPath: string,
    outputLogger?: DebugConsoleLogger,
): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        const isIonicProject = CordovaProjectHelper.isIonicAngularProject(cordovaRootPath);
        let output = "";
        let stderr = "";
        const cordovaProcess = cordovaStartCommand(command, args, env, cordovaRootPath);

        // Prevent these lines to be shown more than once
        // to prevent debug console pollution
        const isShown = {
            "Running command": false,
            "cordova prepare": false,
            "cordova platform add": false,
        };

        // There is error about run command with specified iOS simulator.
        // If this simulator is online error "Error: Unhandled error. ('[ios-sim] Simulator already running.\\n')"
        // is shown
        let skipCommandReject = false;

        cordovaProcess.stderr.on("data", data => {
            stderr += data.toString();
            for (let i = 0; i < errorsToSuppress.length; i++) {
                if (data.toString().includes(errorsToSuppress[i])) {
                    if (
                        data
                            .toString()
                            .includes(
                                "Error: Unhandled error. ('[ios-sim] Simulator already running.\\n')",
                            )
                    ) {
                        skipCommandReject = true;
                    }
                    return;
                }
            }
            outputLogger && outputLogger(data.toString(), "stderr");
        });
        cordovaProcess.stdout.on("data", (data: Buffer) => {
            const str = data
                .toString()
                .replace(/\u001b/g, "")
                .replace(/\[2K\[G/g, ""); // Erasing `[2K[G` artifacts from DEBUG CONSOLE output
            output += str;
            // eslint-disable-next-line
            for (const message in isShown) {
                if (str.includes(message)) {
                    if (!isShown[message]) {
                        isShown[message] = true;
                        outputLogger && outputLogger(str, "stdout");
                    }
                    return;
                }
            }
            outputLogger && outputLogger(str, "stdout");

            if (isIonicProject && str.includes("LAUNCH SUCCESS")) {
                resolve([output, stderr]);
            }
        });
        cordovaProcess.on("exit", exitCode => {
            if (exitCode && !skipCommandReject) {
                reject(
                    new Error(
                        localize(
                            "CommandFailedWithExitCode",
                            "{0} {1} failed with exit code {2}",
                            command,
                            args.join(" "),
                            exitCode,
                        ),
                    ),
                );
            } else {
                resolve([output, stderr]);
            }
        });
        cordovaProcess.on("error", error => {
            reject(error);
        });
    });
}

export function cordovaStartCommand(
    command: string,
    args: string[],
    env: any,
    cordovaRootPath: string,
): child_process.ChildProcess {
    const isIonic = CordovaProjectHelper.isIonicAngularProject(cordovaRootPath);
    const isIonicServe: boolean = args.includes("serve");

    if (isIonic && !isIonicServe) {
        const isIonicCliVersionGte3 = CordovaProjectHelper.isIonicCliVersionGte3(
            cordovaRootPath,
            command,
        );

        if (isIonicCliVersionGte3) {
            args.unshift("cordova");
        }
    }

    if (isIonic) {
        args.push("--no-interactive");
    } else {
        args.push("--no-update-notifier");
    }

    return child_process.spawn(command, args, { cwd: cordovaRootPath, env, shell: true });
}

export function killTree(processId: number): void {
    const cmd =
        process.platform === "win32"
            ? "taskkill.exe"
            : path.join(findFileInFolderHierarchy(__dirname, "scripts"), "terminateProcess.sh");
    const args =
        process.platform === "win32"
            ? ["/F", "/T", "/PID", processId.toString()]
            : [processId.toString()];

    try {
        child_process.execFileSync(cmd, args);
    } catch (err) {}
}

export function killChildProcess(childProcess: child_process.ChildProcess): Promise<void> {
    killTree(childProcess.pid);
    return Promise.resolve();
}
