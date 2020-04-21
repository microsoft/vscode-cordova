// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as Q from "q";
import * as path from "path";
import * as fs from "fs";
import { LoggingDebugSession, OutputEvent } from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
// import { CordovaCDPProxy } from "./cdp-proxy/cordovaCDPProxy";
import * as elementtree from "elementtree";
import { generateRandomPortNumber, retryAsync } from "../utils/extensionHelper";
import { TelemetryHelper } from "../utils/telemetryHelper";
import { CordovaProjectHelper } from "../utils/cordovaProjectHelper";
import { Telemetry } from "../utils/telemetry";
import { execCommand } from "./extension";

enum DebugSessionStatus {
    FirstConnection,
    FirstConnectionPending,
    ConnectionAllowed,
    ConnectionPending,
    ConnectionDone,
    ConnectionFailed,
}

const MISSING_API_ERROR = "Debugger.setAsyncCallStackDepth";
const ANDROID_MANIFEST_PATH = path.join("platforms", "android", "AndroidManifest.xml");
const ANDROID_MANIFEST_PATH_8 = path.join("platforms", "android", "app", "src", "main", "AndroidManifest.xml");

export interface ICordovaAttachRequestArgs extends DebugProtocol.AttachRequestArguments, IAttachRequestArgs {
    cwd: string; /* Automatically set by VS Code to the currently opened folder */
    platform: string;
    target?: string;
    webkitRangeMin?: number;
    webkitRangeMax?: number;
    attachAttempts?: number;
    attachDelay?: number;
    attachTimeout?: number;
    simulatorInExternalBrowser?: boolean;

    // Ionic livereload properties
    ionicLiveReload?: boolean;
}

export interface ICordovaLaunchRequestArgs extends DebugProtocol.LaunchRequestArguments, ICordovaAttachRequestArgs {
    iosDebugProxyPort?: number;
    appStepLaunchTimeout?: number;

    // Ionic livereload properties
    ionicLiveReload?: boolean;
    devServerPort?: number;
    devServerAddress?: string;
    devServerTimeout?: number;

    // Chrome debug properties
    url?: string;
    userDataDir?: string;
    runtimeExecutable?: string;
    runtimeArgs?: string[];

    // Cordova-simulate properties
    simulatePort?: number;
    livereload?: boolean;
    forceprepare?: boolean;
    simulateTempDir?: string;
    corsproxy?: boolean;
    runArguments?: string[];
    cordovaExecutable?: string;
    envFile?: string;
    env?: any;
}

export interface ICordovaCommonRequestArgs extends ICommonRequestArgs {
    // Workaround to suit interface ICommonRequestArgs with launch.json cwd argument
    cwd?: string;
}

interface DebuggingProperties {
    platform: string;
    target?: string;
}

const WIN_APPDATA = process.env.LOCALAPPDATA || "/";
const DEFAULT_CHROME_PATH = {
    LINUX: "/usr/bin/google-chrome",
    OSX: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    WIN: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    WIN_LOCALAPPDATA: path.join(WIN_APPDATA, "Google\\Chrome\\Application\\chrome.exe"),
    WINx86: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
};
const DEFAULT_CHROMIUM_PATH = {
    LINUX: "/usr/bin/chromium-browser",
    OSX: "/Applications/Chromium.app/Contents/MacOS/Chromium",
    WIN: "C:\\Program Files\\Chromium\\Application\\chrome.exe",
    WIN_LOCALAPPDATA: path.join(WIN_APPDATA, "Chromium\\Application\\chrome.exe"),
    WINx86: "C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe",
};
// `RSIDZTW<NL` are process status codes (as per `man ps`), skip them
const PS_FIELDS_SPLITTER_RE = /\s+(?:[RSIDZTW<NL]\s+)?/;

enum TargetType {
    Emulator = "emulator",
    Device = "device",
    Chrome = "chrome",
}

// Keep in sync with sourceMapPathOverrides package.json default values
const DefaultWebSourceMapPathOverrides: ISourceMapPathOverrides = {
    "webpack:///./~/*": "${cwd}/node_modules/*",
    "webpack:///./*": "${cwd}/*",
    "webpack:///*": "*",
    "webpack:///src/*": "${cwd}/*",
    "./*": "${cwd}/*",
};

export interface IAttachRequestArgs extends DebugProtocol.AttachRequestArguments, ILaunchArgs {
    cwd: string; /* Automatically set by VS Code to the currently opened folder */
    port: number;
    url?: string;
    address?: string;
    trace?: string;
}

export interface ILaunchRequestArgs extends DebugProtocol.LaunchRequestArguments, IAttachRequestArgs { }

export class CordovaDebugSession extends LoggingDebugSession {

    private static CHROME_DATA_DIR = "chrome_sandbox_dir"; // The directory to use for the sandboxed Chrome instance that gets launched to debug the app
    private static NO_LIVERELOAD_WARNING = "Warning: Ionic live reload is currently only supported for Ionic 1 projects. Continuing deployment without Ionic live reload...";
    private static SIMULATE_TARGETS: string[] = ["default", "chrome", "chromium", "edge", "firefox", "ie", "opera", "safari"];
    private static pidofNotFoundError = "/system/bin/sh: pidof: not found";
    // Workaround to handle breakpoint location requests correctly on some platforms
    private static debuggingProperties: DebuggingProperties;

    private outputLogger: (message: string, error?: boolean | string) => void;
    private adbPortForwardingInfo: { targetDevice: string, port: number };
    private ionicLivereloadProcess: child_process.ChildProcess;
    private ionicDevServerUrls: string[];
    private cordovaPathTransformer: CordovaPathTransformer;
    private previousLaunchArgs: ICordovaLaunchRequestArgs;
    private previousAttachArgs: ICordovaAttachRequestArgs;
    private simulateDebugHost: SocketIOClient.Socket;
    private telemetryInitialized: boolean;
    private attachedDeferred: Q.Deferred<void>;

    private readonly cdpProxyPort: number;
    private readonly cdpProxyHostAddress: string;
    private readonly terminateCommand: string;
    private readonly pwaNodeSessionName: string;

    private projectRootPath: string;
    private isSettingsInitialized: boolean; // used to prevent parameters reinitialization when attach is called from launch function
    private previousAttachArgs: IAttachRequestArgs;
    private rnCdpProxy: ReactNativeCDPProxy | null;
    private cdpProxyLogLevel: LogLevel;
    private nodeSession: vscode.DebugSession | null;
    private debugSessionStatus: DebugSessionStatus;
    private onDidStartDebugSessionHandler: vscode.Disposable;
    private onDidTerminateDebugSessionHandler: vscode.Disposable;

    constructor(private session: vscode.DebugSession) {
        super();

        // constants definition
        this.cdpProxyPort = generateRandomPortNumber();
        this.cdpProxyHostAddress = "127.0.0.1"; // localhost
        this.terminateCommand = "terminate"; // the "terminate" command is sent from the client to the debug adapter in order to give the debuggee a chance for terminating itself
        this.pwaNodeSessionName = "pwa-node"; // the name of node debug session created by js-debug extension

        // variables definition
        this.isSettingsInitialized = false;
        this.rnCdpProxy = null;
        this.debugSessionStatus = DebugSessionStatus.FirstConnection;
        this.cordovaPathTransformer = (<any>global).cordovaPathTransformer;
        this.telemetryInitialized = false;
        this.outputLogger = (message: string, error?: boolean | string) => {
            let category = "console";
            if (error === true) {
                category = "stderr";
            }
            if (typeof error === "string") {
                category = error;
            }

            let newLine = "\n";
            if (category === "stdout" || category === "stderr") {
                newLine = "";
            }
            this.sendEvent(new OutputEvent(message + newLine, category));
        };
        this.attachedDeferred = Q.defer<void>();
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        super.initializeRequest(response, args);
    }

    protected launchRequest(response: DebugProtocol.LaunchResponse, launchArgs: ICordovaLaunchRequestArgs, request?: DebugProtocol.Request): Promise<void> {
        this.previousLaunchArgs = launchArgs;
        CordovaDebugSession.debuggingProperties = {
            platform: launchArgs.platform,
            target: launchArgs.target,
        };

        return new Promise<void>((resolve, reject) => this.initializeTelemetry(launchArgs.cwd)
            .then(() => TelemetryHelper.generate("launch", (generator) => {
                launchArgs.port = launchArgs.port || 9222;
                if (!launchArgs.target) {
                    if (launchArgs.platform === "browser") {
                        launchArgs.target = "chrome";
                    } else {
                        launchArgs.target = "emulator";
                    }
                    this.outputLogger(`Parameter target is not set - ${launchArgs.target} will be used`);
                }
                generator.add("target", CordovaDebugSession.getTargetType(launchArgs.target), false);
                launchArgs.cwd = CordovaProjectHelper.getCordovaProjectRoot(launchArgs.cwd);
                if (launchArgs.cwd === null) {
                    throw new Error("Current working directory doesn't contain a Cordova project. Please open a Cordova project as a workspace root and try again.");
                }
                launchArgs.timeout = launchArgs.attachTimeout;

                let platform = launchArgs.platform && launchArgs.platform.toLowerCase();

                TelemetryHelper.sendPluginsList(launchArgs.cwd, CordovaProjectHelper.getInstalledPlugins(launchArgs.cwd));

                return Q.all([
                    TelemetryHelper.determineProjectTypes(launchArgs.cwd),
                    CordovaDebugSession.getRunArguments(launchArgs.cwd),
                    CordovaDebugSession.getCordovaExecutable(launchArgs.cwd),
                ]).then(([projectType, runArguments, cordovaExecutable]) => {
                    launchArgs.cordovaExecutable = launchArgs.cordovaExecutable || cordovaExecutable;
                    launchArgs.env = CordovaProjectHelper.getEnvArgument(launchArgs);
                    generator.add("projectType", projectType, false);
                    this.outputLogger(`Launching for ${platform} (This may take a while)...`);

                    switch (platform) {
                        case "android":
                            generator.add("platform", platform, false);
                            if (this.isSimulateTarget(launchArgs.target)) {
                                return this.launchSimulate(launchArgs, projectType, generator);
                            } else {
                                return this.launchAndroid(launchArgs, projectType, runArguments);
                            }
                        case "ios":
                            generator.add("platform", platform, false);
                            if (this.isSimulateTarget(launchArgs.target)) {
                                return this.launchSimulate(launchArgs, projectType, generator);
                            } else {
                                return this.launchIos(launchArgs, projectType, runArguments);
                            }
                        case "windows":
                            generator.add("platform", platform, false);
                            if (this.isSimulateTarget(launchArgs.target)) {
                                return this.launchSimulate(launchArgs, projectType, generator);
                            } else {
                                throw new Error(`Debugging ${platform} platform is not supported.`);
                            }
                        case "serve":
                            generator.add("platform", platform, false);
                            return this.launchServe(launchArgs, projectType, runArguments);
                        // https://github.com/apache/cordova-serve/blob/4ad258947c0e347ad5c0f20d3b48e3125eb24111/src/util.js#L27-L37
                        case "amazon_fireos":
                        case "blackberry10":
                        case "firefoxos":
                        case "ubuntu":
                        case "wp8":
                        case "browser":
                            generator.add("platform", platform, false);
                            return this.launchSimulate(launchArgs, projectType, generator);
                        default:
                            generator.add("unknownPlatform", platform, true);
                            throw new Error(`Unknown Platform: ${platform}`);
                    }
                }).catch((err) => {
                    this.outputLogger(err.message || err, true);

                    return this.cleanUp().then(() => {
                        throw err;
                    });
                }).then(() => {
                    // For the browser platforms, we call super.launch(), which already attaches. For other platforms, attach here
                    if (platform !== "serve" && platform !== "browser" && !this.isSimulateTarget(launchArgs.target)) {
                        return this.attach(launchArgs);
                    }
                });
            }).done(resolve, reject))
            .catch(err => {
                this.outputLogger(err.message || err, true);
                reject(err);
            }));
    }

    protected attachRequest(response: DebugProtocol.AttachResponse, attachArgs: ICordovaAttachRequestArgs, request?: DebugProtocol.Request): Promise<void>  {
        this.previousAttachArgs = attachArgs;
        CordovaDebugSession.debuggingProperties = {
            platform: attachArgs.platform,
            target: attachArgs.target,
        };

        return new Promise<void>((resolve, reject) => this.initializeTelemetry(attachArgs.cwd)
            .then(() => TelemetryHelper.generate("attach", (generator) => {
            attachArgs.port = attachArgs.port || 9222;
            attachArgs.target = attachArgs.target || "emulator";
            generator.add("target", CordovaDebugSession.getTargetType(attachArgs.target), false);
            attachArgs.cwd = CordovaProjectHelper.getCordovaProjectRoot(attachArgs.cwd);
            attachArgs.timeout = attachArgs.attachTimeout;

            let platform = attachArgs.platform && attachArgs.platform.toLowerCase();

            TelemetryHelper.sendPluginsList(attachArgs.cwd, CordovaProjectHelper.getInstalledPlugins(attachArgs.cwd));

            return TelemetryHelper.determineProjectTypes(attachArgs.cwd)
                .then((projectType) => generator.add("projectType", projectType, false))
                .then(() => {
                    this.outputLogger(`Attaching to ${platform}`);
                    switch (platform) {
                        case "android":
                            generator.add("platform", platform, false);
                            return this.attachAndroid(attachArgs);
                        case "ios":
                            generator.add("platform", platform, false);
                            return this.attachIos(attachArgs);
                        default:
                            generator.add("unknownPlatform", platform, true);
                            throw new Error(`Unknown Platform: ${platform}`);
                    }
                }).then((processedAttachArgs: IAttachRequestArgs & { url?: string }) => {
                    this.outputLogger("Attaching to app.");
                    this.outputLogger("", true); // Send blank message on stderr to include a divider between prelude and app starting
                    return super.attach(processedAttachArgs)
                        .catch((err) => {
                            if (err.message && err.message.indexOf(MISSING_API_ERROR) > -1) {
                                // Bug in `vscode-chrome-debug-core` calling unimplemented method Debugger.setAsyncCallStackDepth
                                // just ignore it
                                // https://github.com/Microsoft/vscode-cordova/issues/297
                                return void 0;
                            }
                            throw err;
                        })
                        .then(() => {
                            // Safari remote inspector protocol requires setBreakpointsActive
                            // method to be called for breakpoints to work (see #193 and #247)
                            // In case of error do not reject promise but continue debugging
                            // super.chrome.Debugger.setBreakpointsActive({ active: true })
                            //     .catch(() => this.outputLogger("Failed to call \"setBreakpointsActive\" of debugging frontend. Debugging will continue..."));

                            this.attachedDeferred.resolve(void 0);
                        });
                });
        }).catch((err) => {
            this.outputLogger(err.message || err.format || err, true);

            return this.cleanUp().then(() => {
                throw err;
            });
        }).done(resolve, reject)));
    }

    private launchAndroid(launchArgs: ICordovaLaunchRequestArgs, projectType: IProjectType, runArguments: string[]): Q.Promise<void> {
        let workingDirectory = launchArgs.cwd;

        // Prepare the command line args
        let isDevice = launchArgs.target.toLowerCase() === "device";
        let args = ["run", "android"];

        if (launchArgs.runArguments && launchArgs.runArguments.length > 0) {
            args.push(...launchArgs.runArguments);
        } else if (runArguments && runArguments.length) {
            args.push(...runArguments);
        } else {
            args.push(isDevice ? "--device" : "--emulator", "--verbose");
            if (["device", "emulator"].indexOf(launchArgs.target.toLowerCase()) === -1) {
                args.push(`--target=${launchArgs.target}`);
            }

            // Verify if we are using Ionic livereload
            if (launchArgs.ionicLiveReload) {
                if (CordovaProjectHelper.isIonicAngularProjectByProjectType(projectType)) {
                    // Livereload is enabled, let Ionic do the launch
                    args.push("--livereload");
                } else {
                    this.outputLogger(CordovaDebugSession.NO_LIVERELOAD_WARNING);
                }
            }
        }

        if (args.indexOf("--livereload") > -1) {
            return this.startIonicDevServer(launchArgs, args).then(() => void 0);
        }
        const command = launchArgs.cordovaExecutable || CordovaProjectHelper.getCliCommand(workingDirectory);
        let cordovaResult = cordovaRunCommand(command, args, launchArgs.env, workingDirectory).then((output) => {
            let runOutput = output[0];
            let stderr = output[1];

            // Ionic ends process with zero code, so we need to look for
            // strings with error content to detect failed process
            let errorMatch = /(ERROR.*)/.test(runOutput) || /error:.*/i.test(stderr);
            if (errorMatch) {
                throw new Error(`Error running android`);
            }

            this.outputLogger("App successfully launched");
        }, undefined, (progress) => {
            this.outputLogger(progress[0], progress[1]);
        });

        return cordovaResult;
    }

    private attachAndroid(attachArgs: ICordovaAttachRequestArgs): Q.Promise<IAttachRequestArgs> {
        let errorLogger = (message: string) => this.outputLogger(message, true);
        // Determine which device/emulator we are targeting

        // For devices we look for "device" string but skip lines with "emulator"
        const deviceFilter = (line: string) => /\w+\tdevice/.test(line) && !/emulator/.test(line);
        const emulatorFilter = (line: string) => /device/.test(line) && /emulator/.test(line);

        let adbDevicesResult: Q.Promise<string> = this.runAdbCommand(["devices"], errorLogger)
            .then<string>((devicesOutput) => {

                const targetFilter = attachArgs.target.toLowerCase() === "device" ? deviceFilter :
                    attachArgs.target.toLowerCase() === "emulator" ? emulatorFilter :
                        (line: string) => line.match(attachArgs.target);

                const result = devicesOutput.split("\n")
                    .filter(targetFilter)
                    .map(line => line.replace(/\tdevice/, "").replace("\r", ""))[0];

                if (!result) {
                    errorLogger(devicesOutput);
                    throw new Error(`Unable to find target ${attachArgs.target}`);
                }

                return result;
            }, (err: Error): any => {
                let errorCode: string = (<any>err).code;
                if (errorCode && errorCode === "ENOENT") {
                    throw new Error("Unable to find adb. Please ensure it is in your PATH and re-open Visual Studio Code");
                }

                throw err;
            });

        let packagePromise: Q.Promise<string> = Q.nfcall(fs.readFile, path.join(attachArgs.cwd, ANDROID_MANIFEST_PATH))
            .catch((err) => {
                if (err && err.code === "ENOENT") {
                    return Q.nfcall(fs.readFile, path.join(attachArgs.cwd, ANDROID_MANIFEST_PATH_8));
                }
                throw err;
            })
            .then((manifestContents) => {
                let parsedFile = elementtree.XML(manifestContents.toString());
                let packageKey = "package";
                return parsedFile.attrib[packageKey];
            });

        return Q.all([packagePromise, adbDevicesResult])
            .spread((appPackageName: string, targetDevice: string) => {
            let pidofCommandArguments = ["-s", targetDevice, "shell", "pidof", appPackageName];
            let getPidCommandArguments = ["-s", targetDevice, "shell", "ps"];
            let getSocketsCommandArguments = ["-s", targetDevice, "shell", "cat /proc/net/unix"];

            let findAbstractNameFunction = () =>
                // Get the pid from app package name
                this.runAdbCommand(pidofCommandArguments, errorLogger)
                    .then((pid) => {
                        if (pid && /^[0-9]+$/.test(pid.trim())) {
                            return pid.trim();
                        }

                        throw Error(CordovaDebugSession.pidofNotFoundError);

                    }).catch((err) => {
                        if (err.message !== CordovaDebugSession.pidofNotFoundError) {
                            return;
                        }

                        return this.runAdbCommand(getPidCommandArguments, errorLogger)
                            .then((psResult) => {
                                const lines = psResult.split("\n");
                                const keys = lines.shift().split(PS_FIELDS_SPLITTER_RE);
                                const nameIdx = keys.indexOf("NAME");
                                const pidIdx = keys.indexOf("PID");
                                for (const line of lines) {
                                    const fields = line.trim().split(PS_FIELDS_SPLITTER_RE).filter(field => !!field);
                                    if (fields.length < nameIdx) {
                                        continue;
                                    }
                                    if (fields[nameIdx] === appPackageName) {
                                        return fields[pidIdx];
                                    }
                                }
                            });
                    })
                    // Get the "_devtools_remote" abstract name by filtering /proc/net/unix with process inodes
                    .then(pid =>
                        this.runAdbCommand(getSocketsCommandArguments, errorLogger)
                            .then((getSocketsResult) => {
                                const lines = getSocketsResult.split("\n");
                                const keys = lines.shift().split(/[\s\r]+/);
                                const flagsIdx = keys.indexOf("Flags");
                                const stIdx = keys.indexOf("St");
                                const pathIdx = keys.indexOf("Path");
                                for (const line of lines) {
                                    const fields = line.split(/[\s\r]+/);
                                    if (fields.length < 8) {
                                        continue;
                                    }
                                    // flag = 00010000 (16) -> accepting connection
                                    // state = 01 (1) -> unconnected
                                    if (fields[flagsIdx] !== "00010000" || fields[stIdx] !== "01") {
                                        continue;
                                    }
                                    const pathField = fields[pathIdx];
                                    if (pathField.length < 1 || pathField[0] !== "@") {
                                        continue;
                                    }
                                    if (pathField.indexOf("_devtools_remote") === -1) {
                                        continue;
                                    }

                                    if (pathField === `@webview_devtools_remote_${pid}`) {
                                        // Matches the plain cordova webview format
                                        return pathField.substr(1);
                                    }

                                    if (pathField === `@${appPackageName}_devtools_remote`) {
                                        // Matches the crosswalk format of "@PACKAGENAME_devtools_remote
                                        return pathField.substr(1);
                                    }
                                    // No match, keep searching
                                }
                            })
                    );

            return retryAsync(findAbstractNameFunction, (match) => !!match, 5, 1, 5000, "Unable to find localabstract name of cordova app")
                .then((abstractName) => {
                    // Configure port forwarding to the app
                    let forwardSocketCommandArguments = ["-s", targetDevice, "forward", `tcp:${attachArgs.port}`, `localabstract:${abstractName}`];
                    this.outputLogger("Forwarding debug port");
                    return this.runAdbCommand(forwardSocketCommandArguments, errorLogger).then(() => {
                        this.adbPortForwardingInfo = { targetDevice, port: attachArgs.port };
                    });
                });
        }).then(() => {
            let args: IAttachRequestArgs = JSON.parse(JSON.stringify(attachArgs));
            return args;
        });
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): void {
        if (this.rnCdpProxy) {
            this.rnCdpProxy.stopServer();
            this.rnCdpProxy = null;
        }

        this.onDidStartDebugSessionHandler.dispose();
        this.onDidTerminateDebugSessionHandler.dispose();

        super.disconnectRequest(response, args, request);
    }

    private establishDebugSession(): void {
        if (this.rnCdpProxy) {
            const attachArguments = {
                type: "pwa-node",
                request: "attach",
                name: "Attach",
                continueOnAttach: true,
                port: this.cdpProxyPort,
                smartStep: false,
                // The unique identifier of the debug session. It is used to distinguish Cordova extension's
                // debug sessions from other ones. So we can save and process only the extension's debug sessions
                // in vscode.debug API methods "onDidStartDebugSession" and "onDidTerminateDebugSession".
                cordovaDebugSessionId: this.session.id,
            };

            vscode.debug.startDebugging(
                // this.appLauncher.getWorkspaceFolder(),
                attachArguments,
                this.session
            )
            .then((childDebugSessionStarted: boolean) => {
                if (childDebugSessionStarted) {
                    this.debugSessionStatus = DebugSessionStatus.ConnectionDone;
                } else {
                    this.debugSessionStatus = DebugSessionStatus.ConnectionFailed;
                    throw new Error("Cannot start child debug session");
                }
            },
            err => {
                this.debugSessionStatus = DebugSessionStatus.ConnectionFailed;

                throw err;
            });
        } else {

            throw new Error("Cannot connect to debugger worker: Chrome debugger proxy is offline");
        }
    }

    /**
     * Initializes telemetry.
     */
    private initializeTelemetry(projectRoot: string): Q.Promise<any> {
        if (!this.telemetryInitialized) {
            this.telemetryInitialized = true;
            let version = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "..", "package.json"), "utf-8")).version;
            // Enable telemetry, forced on for now.
            return Telemetry.init("cordova-tools-debug-adapter", version, { isExtensionProcess: false, projectRoot: projectRoot })
                .catch((e) => {
                    this.outputLogger("Could not initialize telemetry." + e.message || e.error || e.data || e);
                });
        } else {
            return Q.resolve(void 0);
        }
    }

    private runAdbCommand(args, errorLogger): Q.Promise<string> {
        const originalPath = process.env["PATH"];
        if (process.env["ANDROID_HOME"]) {
            process.env["PATH"] += path.delimiter + path.join(process.env["ANDROID_HOME"], "platform-tools");
        }
        return execCommand("adb", args, errorLogger).finally(() => {
            process.env["PATH"] = originalPath;
        });
    }
}
