// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as url from "url";
import * as os from "os";
import * as simulate from "cordova-simulate";
import * as vscode from "vscode";
import * as io from "socket.io-client";
import * as execa from "execa";
import * as browserHelper from "vscode-js-debug-browsers";
import {
    LoggingDebugSession,
    OutputEvent,
    logger,
    Logger,
    ErrorDestination,
    InitializedEvent,
} from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import * as elementtree from "elementtree";
import * as nls from "vscode-nls";
import {
    generateRandomPortNumber,
    retryAsync,
    promiseGet,
    findFileInFolderHierarchy,
    isNullOrUndefined,
} from "../utils/extensionHelper";
import {
    TelemetryHelper,
    ISimulateTelemetryProperties,
    TelemetryGenerator,
} from "../utils/telemetryHelper";
import { CordovaProjectHelper, ProjectType } from "../utils/cordovaProjectHelper";
import { Telemetry } from "../utils/telemetry";
import { SimulationInfo } from "../common/simulationInfo";
import { settingsHome } from "../utils/settingsHelper";
import { DeferredPromise } from "../common/node/promise";
import { SimulateHelper } from "../utils/simulateHelper";
import { LogLevel } from "../utils/log/logHelper";
import { CordovaWorkspaceManager } from "../extension/cordovaWorkspaceManager";
import { CordovaSessionManager } from "../extension/cordovaSessionManager";
import { NodeVersionHelper } from "../utils/nodeVersionHelper";
import { AdbHelper } from "../utils/android/adb";
import { AndroidTargetManager, AndroidTarget } from "../utils/android/androidTargetManager";
import { IOSTargetManager, IOSTarget } from "../utils/ios/iOSTargetManager";
import { LaunchScenariosManager } from "../utils/launchScenariosManager";
import { OutputChannelLogger } from "../utils/log/outputChannelLogger";
import { CordovaSession, CordovaSessionStatus } from "./debugSessionWrapper";
import { SourcemapPathTransformer } from "./cdp-proxy/sourcemapPathTransformer";
import { CordovaIosDeviceLauncher } from "./cordovaIosDeviceLauncher";
import { CordovaCDPProxy } from "./cdp-proxy/cordovaCDPProxy";
import { execCommand, cordovaRunCommand, killChildProcess, cordovaStartCommand } from "./extension";
import { JsDebugConfigAdapter } from "./jsDebugConfigAdapter";
import { ICordovaLaunchRequestArgs, ICordovaAttachRequestArgs } from "./requestArgs";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

const ANDROID_MANIFEST_PATH = path.join("platforms", "android", "AndroidManifest.xml");
const ANDROID_MANIFEST_PATH_8 = path.join(
    "platforms",
    "android",
    "app",
    "src",
    "main",
    "AndroidManifest.xml",
);

// `RSIDZTW<NL` are process status codes (as per `man ps`), skip them
const PS_FIELDS_SPLITTER_RE = /\s+(?:[<DILNR-TWZ]\s+)?/;

export const CANCELLATION_ERROR_NAME = "tokenCanceled";

export enum TargetType {
    Emulator = "emulator",
    Device = "device",
    Chrome = "chrome",
    Edge = "edge",
}

export enum PwaDebugType {
    Node = "pwa-node",
    Chrome = "pwa-chrome",
}

export enum PlatformType {
    Android = "android",
    IOS = "ios",
    Windows = "windows",
    Serve = "serve",
    AmazonFireos = "amazon_fireos",
    Blackberry10 = "blackberry10",
    Firefoxos = "firefoxos",
    Ubuntu = "ubuntu",
    Wp8 = "wp8",
    Browser = "browser",
}

/**
 * Enum of possible statuses of debug session
 */
export enum DebugSessionStatus {
    /** The session is active */
    Active,
    /** The session is processing attachment after failed attempt */
    Reattaching,
    /** Debugger attached to the app */
    Attached,
    /** The session is handling disconnect request now */
    Stopping,
    /** The session is stopped */
    Stopped,
    /** Failed to attach to the app */
    AttachFailed,
}

export type DebugConsoleLogger = (message: string, error?: boolean | string) => void;

interface IOSProcessedParams {
    iOSVersion: string;
    iOSAppPackagePath: string;
    webSocketDebuggerUrl: string;
    ionicDevServerUrl?: string;
}

interface WebviewData {
    devtoolsFrontendUrl: string;
    title: string;
    url: string;
    webSocketDebuggerUrl: string;
}

export class CordovaDebugSession extends LoggingDebugSession {
    private static CHROME_DATA_DIR = "chrome_sandbox_dir"; // The directory to use for the sandboxed Chrome instance that gets launched to debug the app
    private static NO_LIVERELOAD_WARNING = localize(
        "IonicLiveReloadIsOnlySupportedForIonic1",
        "Warning: Ionic live reload is currently only supported for Ionic 1 projects. Continuing deployment without Ionic live reload...",
    );
    private static pidofNotFoundError = localize(
        "pidofNotFound",
        "/system/bin/sh: pidof: not found",
    );

    private readonly cdpProxyPort: number;
    private readonly cdpProxyHostAddress: string;
    private readonly stopCommand: string;
    private readonly pwaSessionName: PwaDebugType;

    private workspaceManager: CordovaWorkspaceManager;
    private outputLogger: DebugConsoleLogger;
    private adbPortForwardingInfo: { targetDevice: string; port: number };
    private ionicLivereloadProcess: child_process.ChildProcess;
    private ionicDevServerUrls: string[];
    private simulateDebugHost: SocketIOClient.Socket;
    private telemetryInitialized: boolean;
    private attachedDeferred: DeferredPromise<void>;
    private cdpProxyLogLevel: LogLevel;
    private jsDebugConfigAdapter: JsDebugConfigAdapter;
    private isSettingsInitialized: boolean; // used to prevent parameters reinitialization when attach is called from launch function
    private cordovaCdpProxy: CordovaCDPProxy | null;
    private browserProc: child_process.ChildProcess;
    private onDidTerminateDebugSessionHandler: vscode.Disposable;
    private cancellationTokenSource: vscode.CancellationTokenSource;
    private vsCodeDebugSession: vscode.DebugSession;
    private iOSTargetManager: IOSTargetManager;
    private debugSessionStatus: DebugSessionStatus;
    private cdpProxyErrorHandlerDescriptor?: vscode.Disposable;
    private attachRetryCount: number;
    private setChromeExitTypeNormal?: () => void;

    constructor(
        private cordovaSession: CordovaSession,
        private sessionManager: CordovaSessionManager,
    ) {
        super();

        // constants definition
        this.cdpProxyPort = generateRandomPortNumber();
        this.cancellationTokenSource = new vscode.CancellationTokenSource();
        this.cdpProxyHostAddress = "127.0.0.1"; // localhost
        this.stopCommand = "workbench.action.debug.stop"; // the command which simulates a click on the "Stop" button
        this.vsCodeDebugSession = cordovaSession.getVSCodeDebugSession();
        this.debugSessionStatus = DebugSessionStatus.Active;
        this.attachRetryCount = 2;

        if (
            this.vsCodeDebugSession.configuration.platform === PlatformType.IOS &&
            !SimulateHelper.isSimulate({
                target: this.vsCodeDebugSession.configuration.target,
                simulatePort: this.vsCodeDebugSession.configuration.simulatePort,
            })
        ) {
            this.pwaSessionName = PwaDebugType.Node; // the name of Node debug session created by js-debug extension
        } else {
            this.pwaSessionName = PwaDebugType.Chrome; // the name of Chrome debug session created by js-debug extension
        }

        // variables definition
        this.cordovaCdpProxy = null;
        this.telemetryInitialized = false;
        this.jsDebugConfigAdapter = new JsDebugConfigAdapter();
        this.iOSTargetManager = new IOSTargetManager();
        this.onDidTerminateDebugSessionHandler = vscode.debug.onDidTerminateDebugSession(
            this.handleTerminateDebugSession.bind(this),
        );
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
        this.attachedDeferred = new DeferredPromise<void>();
    }

    /**
     * Target type for telemetry
     */
    private static getTargetType(target: string): string {
        if (/emulator/i.test(target)) {
            return TargetType.Emulator;
        }

        if (/chrom/i.test(target)) {
            return TargetType.Chrome;
        }

        return TargetType.Device;
    }

    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments,
    ): void {
        // Support default breakpoints filters for exceptions
        response.body.exceptionBreakpointFilters = [
            {
                filter: "all",
                label: "Caught Exceptions",
                default: false,
            },
            {
                filter: "uncaught",
                label: "Uncaught Exceptions",
                default: false,
            },
        ];

        this.sendResponse(response);

        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        this.sendEvent(new InitializedEvent());
    }

    protected launchRequest(
        response: DebugProtocol.LaunchResponse,
        launchArgs: ICordovaLaunchRequestArgs,
        request?: DebugProtocol.Request,
    ): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (isNullOrUndefined(launchArgs.cwd)) {
                reject(
                    new Error(
                        localize(
                            "CwdUndefined",
                            "Launch argument 'cwd' is undefined, please add it to your launch.json. Example: 'cwd': '${workspaceFolder}' to point to your current working directory.",
                        ),
                    ),
                );
            }
            return this.initializeTelemetry(launchArgs.cwd) // eslint-disable-line
                .then(() => {
                    this.initializeSettings(launchArgs);
                })
                .then(() =>
                    TelemetryHelper.generate("launch", generator => {
                        launchArgs.port = launchArgs.port || 9222;
                        if (!launchArgs.target) {
                            if (launchArgs.platform === PlatformType.Browser) {
                                launchArgs.target = "chrome";
                            } else {
                                launchArgs.target = TargetType.Emulator;
                            }
                            this.outputLogger(
                                `Parameter target is not set - ${launchArgs.target} will be used`,
                            );
                        }
                        generator.add(
                            "target",
                            CordovaDebugSession.getTargetType(launchArgs.target),
                            false,
                        );
                        if (launchArgs.cwd === null) {
                            throw new Error(
                                localize(
                                    "CurrentCWDDoesntContainACordovaProject",
                                    "Current working directory doesn't contain a Cordova project. Please open a Cordova project as a workspace root and try again.",
                                ),
                            );
                        }
                        launchArgs.timeout = launchArgs.attachTimeout;

                        const platform = launchArgs.platform && launchArgs.platform.toLowerCase();

                        TelemetryHelper.sendPluginsList(
                            launchArgs.cwd,
                            CordovaProjectHelper.getInstalledPlugins(launchArgs.cwd),
                        );

                        return Promise.all([
                            TelemetryHelper.determineProjectTypes(launchArgs.cwd),
                            this.workspaceManager.getRunArguments(launchArgs.cwd),
                            this.workspaceManager.getCordovaExecutable(launchArgs.cwd),
                        ])
                            .then(([projectType, runArguments, cordovaExecutable]) => {
                                launchArgs.cordovaExecutable =
                                    launchArgs.cordovaExecutable || cordovaExecutable;
                                launchArgs.allEnv = CordovaProjectHelper.getEnvArgument(launchArgs);
                                generator.add(
                                    "projectType",
                                    TelemetryHelper.prepareProjectTypesTelemetry(projectType),
                                    false,
                                );
                                this.outputLogger(
                                    localize(
                                        "LaunchingForPlatform",
                                        "Launching for {0} (This may take a while)...",
                                        platform,
                                    ),
                                );

                                switch (platform) {
                                    case PlatformType.Android:
                                        generator.add("platform", platform, false);
                                        if (SimulateHelper.isSimulateTarget(launchArgs.target)) {
                                            return this.launchSimulate(
                                                launchArgs,
                                                projectType,
                                                generator,
                                            );
                                        }
                                        return this.launchAndroid(
                                            launchArgs,
                                            projectType,
                                            runArguments,
                                        );

                                    case PlatformType.IOS:
                                        generator.add("platform", platform, false);
                                        if (SimulateHelper.isSimulateTarget(launchArgs.target)) {
                                            return this.launchSimulate(
                                                launchArgs,
                                                projectType,
                                                generator,
                                            );
                                        }
                                        return this.launchIos(
                                            launchArgs,
                                            projectType,
                                            runArguments,
                                        );

                                    case PlatformType.Windows:
                                        generator.add("platform", platform, false);
                                        if (SimulateHelper.isSimulateTarget(launchArgs.target)) {
                                            return this.launchSimulate(
                                                launchArgs,
                                                projectType,
                                                generator,
                                            );
                                        }
                                        throw new Error(
                                            `Debugging ${platform} platform is not supported.`,
                                        );

                                    case PlatformType.Serve:
                                        generator.add("platform", platform, false);
                                        return this.launchServe(
                                            launchArgs,
                                            projectType,
                                            runArguments,
                                        );
                                    // https://github.com/apache/cordova-serve/blob/4ad258947c0e347ad5c0f20d3b48e3125eb24111/src/util.js#L27-L37
                                    case PlatformType.AmazonFireos:
                                    case PlatformType.Blackberry10:
                                    case PlatformType.Firefoxos:
                                    case PlatformType.Ubuntu:
                                    case PlatformType.Wp8:
                                    case PlatformType.Browser:
                                        generator.add("platform", platform, false);
                                        return this.launchSimulate(
                                            launchArgs,
                                            projectType,
                                            generator,
                                        );
                                    default:
                                        generator.add("unknownPlatform", platform, true);
                                        throw new Error(
                                            localize(
                                                "UnknownPlatform",
                                                "Unknown Platform: {0}",
                                                platform,
                                            ),
                                        );
                                }
                            })
                            .catch(err => {
                                this.outputLogger(err.message || err, true);
                                return this.cleanUp().then(() => {
                                    throw err;
                                });
                            })
                            .then(() => {
                                // For the browser platforms, we call super.launch(), which already attaches. For other platforms, attach here
                                if (
                                    platform !== PlatformType.Serve &&
                                    platform !== PlatformType.Browser &&
                                    !SimulateHelper.isSimulateTarget(launchArgs.target)
                                ) {
                                    return this.vsCodeDebugSession.customRequest(
                                        "attach",
                                        launchArgs,
                                    );
                                }
                            });
                    }).then(() => {
                        this.sendResponse(response);
                        this.cordovaSession.setStatus(CordovaSessionStatus.Activated);
                        resolve();
                    }),
                )
                .catch(err => reject(err));
        }).catch(err => this.terminateWithErrorResponse(err, response));
    }

    protected attachRequest(
        response: DebugProtocol.AttachResponse,
        attachArgs: ICordovaAttachRequestArgs,
        request?: DebugProtocol.Request,
    ): Promise<void> {
        return this.doAttach(attachArgs)
            .then(() => {
                this.attachedDeferred.resolve();
                this.sendResponse(response);
                this.cordovaSession.setStatus(CordovaSessionStatus.Activated);
            })
            .catch(err => {
                return this.cleanUp().finally(() => {
                    this.terminateWithErrorResponse(err, response);
                });
            });
    }

    protected doAttach(attachArgs: ICordovaAttachRequestArgs): Promise<void> {
        return new Promise<void>((resolve, reject) =>
            this.initializeTelemetry(attachArgs.cwd) // eslint-disable-line
                .then(() => {
                    this.initializeSettings(attachArgs);
                })
                .then(() =>
                    TelemetryHelper.generate("attach", generator => {
                        attachArgs.port = attachArgs.port || 9222;
                        attachArgs.target = attachArgs.target || TargetType.Emulator;

                        generator.add(
                            "target",
                            CordovaDebugSession.getTargetType(attachArgs.target),
                            false,
                        );
                        attachArgs.timeout = attachArgs.attachTimeout;

                        const platform = attachArgs.platform && attachArgs.platform.toLowerCase();
                        const target = attachArgs.target && attachArgs.target.toLowerCase();

                        TelemetryHelper.sendPluginsList(
                            attachArgs.cwd,
                            CordovaProjectHelper.getInstalledPlugins(attachArgs.cwd),
                        );
                        return TelemetryHelper.determineProjectTypes(attachArgs.cwd)
                            .then(projectType => {
                                const sourcemapPathTransformer = new SourcemapPathTransformer(
                                    attachArgs,
                                    projectType,
                                );
                                this.cordovaCdpProxy = new CordovaCDPProxy(
                                    this.cdpProxyHostAddress,
                                    this.cdpProxyPort,
                                    sourcemapPathTransformer,
                                    projectType,
                                    attachArgs,
                                );
                                this.cordovaCdpProxy.setApplicationTargetPort(attachArgs.port);
                                generator.add(
                                    "projectType",
                                    TelemetryHelper.prepareProjectTypesTelemetry(projectType),
                                    false,
                                );
                                return this.cordovaCdpProxy.createServer(
                                    this.cdpProxyLogLevel,
                                    this.cancellationTokenSource.token,
                                );
                            })
                            .then(() => {
                                if (
                                    (platform === PlatformType.Android ||
                                        platform === PlatformType.IOS) &&
                                    !SimulateHelper.isSimulateTarget(target)
                                ) {
                                    this.outputLogger(
                                        localize(
                                            "AttachingToPlatform",
                                            "Attaching to {0}",
                                            platform,
                                        ),
                                    );
                                    switch (platform) {
                                        case PlatformType.Android:
                                            generator.add("platform", platform, false);
                                            return this.attachAndroid(attachArgs);
                                        case PlatformType.IOS:
                                            generator.add("platform", platform, false);
                                            return this.attachIos(attachArgs);
                                        default:
                                            generator.add("unknownPlatform", platform, true);
                                            throw new Error(
                                                localize(
                                                    "UnknownPlatform",
                                                    "Unknown Platform: {0}",
                                                    platform,
                                                ),
                                            );
                                    }
                                } else {
                                    return attachArgs;
                                }
                            })
                            .then(
                                (
                                    processedAttachArgs: ICordovaAttachRequestArgs & {
                                        url?: string;
                                    },
                                ) => {
                                    this.outputLogger(
                                        localize("AttachingToApp", "Attaching to app"),
                                    );
                                    this.outputLogger("", true); // Send blank message on stderr to include a divider between prelude and app starting
                                    if (this.cordovaCdpProxy) {
                                        if (processedAttachArgs.webSocketDebuggerUrl) {
                                            this.cordovaCdpProxy.setBrowserInspectUri(
                                                processedAttachArgs.webSocketDebuggerUrl,
                                            );
                                        }
                                        this.cordovaCdpProxy.configureCDPMessageHandlerAccordingToProcessedAttachArgs(
                                            processedAttachArgs,
                                        );
                                        this.cdpProxyErrorHandlerDescriptor =
                                            this.cordovaCdpProxy.onError(async (err: Error) => {
                                                if (this.attachRetryCount > 0) {
                                                    this.debugSessionStatus =
                                                        DebugSessionStatus.Reattaching;
                                                    this.attachRetryCount--;
                                                    await this.attachmentCleanUp();
                                                    this.outputLogger(
                                                        localize(
                                                            "ReattachingToApp",
                                                            "Failed attempt to attach to the app. Trying to reattach...",
                                                        ),
                                                    );
                                                    void this.doAttach(attachArgs);
                                                } else {
                                                    this.showError(err);
                                                    this.terminate();
                                                    this.cdpProxyErrorHandlerDescriptor?.dispose();
                                                }
                                            });
                                    }
                                    this.establishDebugSession(
                                        processedAttachArgs,
                                        resolve,
                                        reject,
                                    );
                                },
                            );
                    }).catch(err => {
                        this.outputLogger(err.message || err.format || err, true);
                        throw err;
                    }),
                )
                .catch(err => reject(err)),
        ).then(
            () => {
                this.debugSessionStatus = DebugSessionStatus.Attached;
            },
            err => {
                this.debugSessionStatus = DebugSessionStatus.AttachFailed;
                throw err;
            },
        );
    }

    protected terminateWithErrorResponse(error: Error, response: DebugProtocol.Response): void {
        // We can't print error messages after the debugging session is stopped. This could break the extension work.
        if (error.name === CANCELLATION_ERROR_NAME) {
            return;
        }
        const errorString = error.message || error.name || "Error";
        this.sendErrorResponse(
            response,
            { format: errorString, id: 1 },
            undefined,
            undefined,
            ErrorDestination.User,
        );
    }

    protected async disconnectRequest(
        response: DebugProtocol.DisconnectResponse,
        args: DebugProtocol.DisconnectArguments,
        request?: DebugProtocol.Request,
    ): Promise<void> {
        await this.cleanUp(args.restart);
        this.debugSessionStatus = DebugSessionStatus.Stopped;
        super.disconnectRequest(response, args, request);
    }

    private handleTerminateDebugSession(debugSession: vscode.DebugSession) {
        if (
            debugSession.configuration.cordovaDebugSessionId ===
                this.cordovaSession.getSessionId() &&
            debugSession.type === this.pwaSessionName &&
            this.debugSessionStatus !== DebugSessionStatus.Reattaching
        ) {
            this.terminate();
        }
    }

    private establishDebugSession(
        attachArgs: ICordovaAttachRequestArgs,
        resolve?: (value?: void | PromiseLike<void> | undefined) => void,
        reject?: (reason?: any) => void,
    ): void {
        if (this.cordovaCdpProxy) {
            const attachArguments =
                this.pwaSessionName === PwaDebugType.Chrome
                    ? this.jsDebugConfigAdapter.createChromeDebuggingConfig(
                          attachArgs,
                          this.cdpProxyPort,
                          this.pwaSessionName,
                          this.cordovaSession.getSessionId(),
                      )
                    : this.jsDebugConfigAdapter.createSafariDebuggingConfig(
                          attachArgs,
                          this.cdpProxyPort,
                          this.pwaSessionName,
                          this.cordovaSession.getSessionId(),
                      );

            vscode.debug
                .startDebugging(this.workspaceManager.workspaceRoot, attachArguments, {
                    parentSession: this.vsCodeDebugSession,
                    consoleMode: vscode.DebugConsoleMode.MergeWithParent,
                })
                .then(
                    (childDebugSessionStarted: boolean) => {
                        if (childDebugSessionStarted) {
                            if (resolve) {
                                resolve();
                            }
                        } else {
                            reject(
                                new Error(
                                    localize(
                                        "CannotStartChildDebugSession",
                                        "Cannot start child debug session",
                                    ),
                                ),
                            );
                        }
                    },
                    err => {
                        reject(err);
                    },
                );
        } else {
            throw new Error(
                localize(
                    "CannotConnectToDebuggerWorkerProxyOffline",
                    "Cannot connect to debugger worker: Chrome debugger proxy is offline",
                ),
            );
        }
    }

    private initializeSettings(args: ICordovaAttachRequestArgs | ICordovaLaunchRequestArgs): void {
        if (!this.isSettingsInitialized) {
            this.workspaceManager = CordovaWorkspaceManager.getWorkspaceManagerByProjectRootPath(
                args.cwd,
            );
            this.isSettingsInitialized = true;
            logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Log);
            this.cdpProxyLogLevel = args.trace ? LogLevel.Custom : LogLevel.None;

            if (args.runtimeVersion) {
                NodeVersionHelper.nvmSupport(args);
            }
        }
    }

    /**
     * Initializes telemetry.
     */
    private initializeTelemetry(projectRoot: string): Promise<void> {
        if (!this.telemetryInitialized) {
            this.telemetryInitialized = true;
            const version = JSON.parse(
                fs.readFileSync(findFileInFolderHierarchy(__dirname, "package.json"), "utf-8"),
            ).version;
            // Enable telemetry, forced on for now.
            return Telemetry.init("cordova-tools-debug-adapter", version, {
                isExtensionProcess: false,
                projectRoot,
            }).catch(e => {
                this.outputLogger(
                    localize(
                        "CouldNotInitializeTelemetry",
                        "Could not initialize telemetry. {0}",
                        e.message || e.error || e.data || e,
                    ),
                );
            });
        }
        return Promise.resolve();
    }

    private runAdbCommand(args, errorLogger): Promise<string> {
        const originalPath = process.env.PATH;
        if (process.env.ANDROID_HOME) {
            process.env.PATH +=
                path.delimiter + path.join(process.env.ANDROID_HOME, "platform-tools");
        }
        return execCommand("adb", args, errorLogger).finally(() => {
            process.env.PATH = originalPath;
        });
    }

    private launchSimulate(
        launchArgs: ICordovaLaunchRequestArgs,
        projectType: ProjectType,
        generator: TelemetryGenerator,
    ): Promise<any> {
        const simulateTelemetryPropts: ISimulateTelemetryProperties = {
            platform: launchArgs.platform,
            target: launchArgs.target,
            port: launchArgs.port,
            simulatePort: launchArgs.simulatePort,
        };

        if (launchArgs.hasOwnProperty("livereload")) {
            simulateTelemetryPropts.livereload = launchArgs.livereload;
        }

        if (launchArgs.hasOwnProperty("livereloadDelay")) {
            simulateTelemetryPropts.livereloadDelay = launchArgs.livereloadDelay;
        }

        if (launchArgs.hasOwnProperty("forcePrepare")) {
            simulateTelemetryPropts.forcePrepare = launchArgs.forcePrepare;
        }

        generator.add("simulateOptions", simulateTelemetryPropts, false);

        let simulateInfo: SimulationInfo;

        const getEditorsTelemetry = this.workspaceManager
            .getVisibleEditorsCount()
            .then(editorsCount => {
                generator.add("visibleTextEditors", editorsCount, false);
            })
            .catch(e => {
                this.outputLogger(
                    localize(
                        "CouldntoReadTheVisibleTextEditors",
                        "Could not read the visible text editors. {0}",
                        this.getErrorMessage(e),
                    ),
                );
            });

        const launchSimulate = Promise.resolve()
            .then(() => {
                const simulateOptions = this.convertLaunchArgsToSimulateArgs(launchArgs);
                return this.workspaceManager.launchSimulateServer(
                    launchArgs.cwd,
                    simulateOptions,
                    projectType,
                );
            })
            .then((simInfo: SimulationInfo) => {
                simulateInfo = simInfo;
                return this.connectSimulateDebugHost(simulateInfo);
            })
            .then(() => {
                launchArgs.userDataDir = path.join(
                    settingsHome(),
                    CordovaDebugSession.CHROME_DATA_DIR,
                );
                return this.workspaceManager.launchSimHost(launchArgs.target);
            })
            .then(() => {
                // Launch Chrome and attach
                launchArgs.simulatePort = CordovaProjectHelper.getPortFromURL(
                    simulateInfo.appHostUrl,
                );
                launchArgs.url = simulateInfo.appHostUrl;
                this.outputLogger(localize("AttachingToApp", "Attaching to app"));

                return this.launchChromiumBasedBrowser(launchArgs);
            })
            .catch(e => {
                this.outputLogger(
                    localize(
                        "AnErrorOccuredWhileAttachingToTheDebugger",
                        "An error occurred while attaching to the debugger. {0}",
                        this.getErrorMessage(e),
                    ),
                );
                throw e;
            })
            .then(() => undefined);

        return Promise.all([launchSimulate, getEditorsTelemetry]);
    }

    private changeSimulateViewport(data: simulate.ResizeViewportData): Promise<void> {
        return this.attachedDeferred.promise.then(() => {
            if (this.cordovaCdpProxy) {
                this.cordovaCdpProxy.getSimPageTargetAPI()?.Emulation.setDeviceMetricsOverride({
                    width: data.width,
                    height: data.height,
                    deviceScaleFactor: 0,
                    mobile: true,
                });
            }
        });
    }

    private connectSimulateDebugHost(simulateInfo: SimulationInfo): Promise<void> {
        // Connect debug-host to cordova-simulate
        const viewportResizeFailMessage = localize(
            "ViewportResizingFailed",
            "Viewport resizing failed. Please try again.",
        );
        return new Promise((resolve, reject) => {
            const simulateConnectErrorHandler = (err: any): void => {
                this.outputLogger("Error connecting to the simulated app.");
                reject(err);
            };

            this.simulateDebugHost = io.connect(simulateInfo.urlRoot);
            this.simulateDebugHost.on("connect_error", simulateConnectErrorHandler);
            this.simulateDebugHost.on("connect_timeout", simulateConnectErrorHandler);
            this.simulateDebugHost.on("connect", () => {
                this.simulateDebugHost.on(
                    "resize-viewport",
                    (data: simulate.ResizeViewportData) => {
                        this.changeSimulateViewport(data).catch(() => {
                            this.outputLogger(viewportResizeFailMessage, true);
                        });
                    },
                );
                this.simulateDebugHost.emit("register-debug-host", {
                    handlers: ["resize-viewport"],
                });
                resolve(undefined);
            });
        });
    }

    private convertLaunchArgsToSimulateArgs(
        launchArgs: ICordovaLaunchRequestArgs,
    ): simulate.SimulateOptions {
        const result: simulate.SimulateOptions = {};

        result.platform = launchArgs.platform;
        result.target = launchArgs.target;
        result.port = launchArgs.simulatePort;
        result.livereload = launchArgs.livereload;
        result.forceprepare = launchArgs.forcePrepare;
        result.simulationpath = launchArgs.simulateTempDir;
        result.corsproxy = launchArgs.corsProxy;
        result.livereloaddelay = launchArgs.livereloadDelay;
        result.spaurlrewrites = launchArgs.spaUrlRewrites;
        result.lang = vscode.env.language;

        return result;
    }

    private addBuildFlagToArgs(runArgs: Array<string> = []): Array<string> {
        const hasBuildFlag = runArgs.findIndex(arg => arg.includes("--buildFlag")) > -1;

        if (!hasBuildFlag) {
            // Workaround for dealing with new build system in XCode 10
            // https://github.com/apache/cordova-ios/issues/407

            runArgs.unshift("--buildFlag=-UseModernBuildSystem=0");
        }

        return runArgs;
    }

    private async launchIos(
        launchArgs: ICordovaLaunchRequestArgs,
        projectType: ProjectType,
        runArguments: string[],
    ): Promise<void> {
        if (os.platform() !== "darwin") {
            throw new Error(
                localize(
                    "UnableToLaunchiOSOnNonMacMachnines",
                    "Unable to launch iOS on non-mac machines",
                ),
            );
        }
        const useDefaultCLI = async () => {
            this.outputLogger("Continue using standard CLI workflow.");
            const debuggableDevices = await this.iOSTargetManager.getOnlineTargets();
            launchArgs.target = debuggableDevices.length
                ? debuggableDevices[0].id
                : TargetType.Emulator;
        };

        this.outputLogger(localize("LaunchingApp", "Launching the app (This may take a while)..."));

        const workingDirectory = launchArgs.cwd;
        const iosDebugProxyPort = launchArgs.iosDebugProxyPort || 9221;

        const command =
            launchArgs.cordovaExecutable || CordovaProjectHelper.getCliCommand(workingDirectory);
        const args = ["run", "ios"];

        if (launchArgs.runArguments && launchArgs.runArguments.length > 0) {
            const launchRunArgs = this.addBuildFlagToArgs(launchArgs.runArguments);
            args.push(...launchRunArgs);
        } else if (runArguments && runArguments.length) {
            const runArgs = this.addBuildFlagToArgs(runArguments);
            args.push(...runArgs);
        } else {
            try {
                const target = await this.resolveIOSTarget(launchArgs, false);
                if (target) {
                    args.push(target.isVirtualTarget ? "--emulator" : "--device");
                    args.push(
                        `--target=${
                            target.isVirtualTarget && target.simIdentifier && !projectType.isIonic
                                ? target.simIdentifier
                                : target.id
                        }`,
                    );
                } else {
                    this.outputLogger(
                        `Could not find debugable target '${launchArgs.target}'.`,
                        true,
                    );
                    await useDefaultCLI();
                }
            } catch (err) {
                this.outputLogger(err.message || err, true);
                await useDefaultCLI();
            }

            const buildArg = this.addBuildFlagToArgs();
            args.push(...buildArg);

            if (launchArgs.ionicLiveReload) {
                // Verify if we are using Ionic livereload
                if (projectType.isIonic) {
                    // Livereload is enabled, let Ionic do the launch
                    args.push("--livereload");
                    // '--external' parameter is required since for iOS devices, port forwarding is not yet an option (https://github.com/ionic-team/native-run/issues/20)
                    if (args.includes("--device")) {
                        args.push("--external");
                    }
                } else {
                    this.outputLogger(CordovaDebugSession.NO_LIVERELOAD_WARNING);
                }
            }
        }

        if (args.includes("--livereload")) {
            return this.startIonicDevServer(launchArgs, args).then(() => undefined);
        }

        // cordova run ios does not terminate, so we do not know when to try and attach.
        // Therefore we parse the command's output to find the special key, which means that the application has been successfully launched.
        await cordovaRunCommand(
            command,
            args,
            launchArgs.allEnv,
            workingDirectory,
            this.outputLogger,
        );
        if (args.includes("--device")) {
            await CordovaIosDeviceLauncher.startDebugProxy(iosDebugProxyPort);
        }
    }

    private attachIos(attachArgs: ICordovaAttachRequestArgs): Promise<ICordovaAttachRequestArgs> {
        return this.resolveIOSTarget(attachArgs, true).then((target?: IOSTarget) => {
            if (!target) {
                throw new Error(`Unable to find the target ${attachArgs.target}`);
            }

            attachArgs.webkitRangeMin = attachArgs.webkitRangeMin || 9223;
            attachArgs.webkitRangeMax = attachArgs.webkitRangeMax || 9322;
            attachArgs.attachAttempts = attachArgs.attachAttempts || 20;
            attachArgs.attachDelay = attachArgs.attachDelay || 1000;
            // Start the tunnel through to the webkit debugger on the device
            this.outputLogger("Configuring debugging proxy");

            const retry = function <T>(func, condition, retryCount, cancellationToken): Promise<T> {
                return retryAsync(
                    func,
                    condition,
                    retryCount,
                    1,
                    attachArgs.attachDelay,
                    localize("UnableToFindWebview", "Unable to find Webview"),
                    cancellationToken,
                );
            };

            const getBundleIdentifier = () => {
                return CordovaIosDeviceLauncher.getBundleIdentifier(attachArgs.cwd).then(
                    (packageId: string) => {
                        return target.isVirtualTarget
                            ? CordovaIosDeviceLauncher.getPathOnSimulator(
                                  packageId,
                                  target.simDataPath,
                              )
                            : CordovaIosDeviceLauncher.getPathOnDevice(packageId);
                    },
                );
            };

            const getSimulatorProxyPort = (
                iOSAppPackagePath,
            ): Promise<{
                iOSAppPackagePath: string;
                targetPort: number;
                iOSVersion: string;
            }> => {
                return promiseGet(
                    `http://localhost:${attachArgs.port}/json`,
                    localize(
                        "UnableToCommunicateWithiOSWebkitDebugProxy",
                        "Unable to communicate with ios_webkit_debug_proxy",
                    ),
                ).then((response: string) => {
                    try {
                        // An example of a json response from IWDP
                        // [{
                        //     "deviceId": "00008020-XXXXXXXXXXXXXXXX",
                        //     "deviceName": "iPhone name",
                        //     "deviceOSVersion": "13.4.1",
                        //     "url": "localhost:9223"
                        //  }]
                        const endpointsList = JSON.parse(response);
                        const devices = endpointsList.find(entry =>
                            target.isVirtualTarget
                                ? entry.deviceId === "SIMULATOR"
                                : entry.deviceId !== "SIMULATOR",
                        );
                        const device = devices;
                        // device.url is of the form 'localhost:port'
                        return {
                            iOSAppPackagePath,
                            targetPort: parseInt(device.url.split(":")[1], 10),
                            iOSVersion: target.system,
                        };
                    } catch (e) {
                        throw new Error(
                            localize(
                                "UnableToFindiOSTargetDeviceOrSimulator",
                                'Unable to find iOS target device/simulator. Please check that "Settings > Safari > Advanced > Web Inspector = ON" or try specifying a different "port" parameter in launch.json', // eslint-disable-line
                            ),
                        );
                    }
                });
            };

            const getWebSocketDebuggerUrl = ({
                iOSAppPackagePath,
                targetPort,
                iOSVersion,
            }): Promise<IOSProcessedParams> => {
                return retry(
                    () =>
                        promiseGet(
                            `http://localhost:${targetPort}/json`,
                            localize(
                                "UnableToCommunicateWithTarget",
                                "Unable to communicate with target",
                            ),
                        ).then((response: string) => {
                            try {
                                // An example of a json response from IWDP
                                // [{
                                //     "devtoolsFrontendUrl": "",
                                //     "faviconUrl": "",
                                //     "thumbnailUrl": "/thumb/ionic://localhost/tabs/tab1",
                                //     "title": "Ionic App",
                                //     "url": "ionic://localhost/tabs/tab1",
                                //     "webSocketDebuggerUrl": "ws://localhost:9223/devtools/page/1",
                                //     "appId": "PID:37819"
                                //  }]
                                const webviewsList: Array<WebviewData> = JSON.parse(response);
                                if (webviewsList.length === 0) {
                                    throw new Error(
                                        localize(
                                            "UnableToFindTargetApp",
                                            "Unable to find target app",
                                        ),
                                    );
                                }
                                const cordovaWebview = this.getCordovaWebview(
                                    webviewsList,
                                    iOSAppPackagePath,
                                    !!attachArgs.ionicLiveReload,
                                );
                                if (!cordovaWebview.webSocketDebuggerUrl) {
                                    throw new Error(
                                        localize(
                                            "WebsocketDebuggerUrlIsEmpty",
                                            "WebSocket Debugger Url is empty",
                                        ),
                                    );
                                }
                                let ionicDevServerUrl;
                                if (this.ionicDevServerUrls) {
                                    ionicDevServerUrl = this.ionicDevServerUrls.find(
                                        url => cordovaWebview.url.indexOf(url) === 0,
                                    );
                                }
                                return {
                                    webSocketDebuggerUrl: cordovaWebview.webSocketDebuggerUrl,
                                    iOSVersion,
                                    iOSAppPackagePath,
                                    ionicDevServerUrl,
                                };
                            } catch (e) {
                                throw new Error(
                                    localize("UnableToFindTargetApp", "Unable to find target app"),
                                );
                            }
                        }),
                    result => !!result,
                    5,
                    this.cancellationTokenSource.token,
                );
            };

            const getAttachRequestArgs = (): Promise<ICordovaAttachRequestArgs> =>
                CordovaIosDeviceLauncher.startWebkitDebugProxy(
                    attachArgs.port,
                    attachArgs.webkitRangeMin,
                    attachArgs.webkitRangeMax,
                    target,
                )
                    .then(getBundleIdentifier)
                    .then(getSimulatorProxyPort)
                    .then(getWebSocketDebuggerUrl)
                    .then((iOSProcessedParams: IOSProcessedParams) => {
                        attachArgs.webSocketDebuggerUrl = iOSProcessedParams.webSocketDebuggerUrl;
                        attachArgs.iOSVersion = iOSProcessedParams.iOSVersion;
                        attachArgs.iOSAppPackagePath = iOSProcessedParams.iOSAppPackagePath;
                        if (iOSProcessedParams.ionicDevServerUrl) {
                            attachArgs.devServerAddress = url.parse(
                                iOSProcessedParams.ionicDevServerUrl,
                            ).hostname;
                        }
                        return attachArgs;
                    });

            return retry(
                getAttachRequestArgs,
                () => true,
                attachArgs.attachAttempts,
                this.cancellationTokenSource.token,
            );
        });
    }

    private getCordovaWebview(
        webviewsList: Array<WebviewData>,
        iOSAppPackagePath: string,
        ionicLiveReload: boolean,
    ): WebviewData {
        const cordovaWebview = webviewsList.find(webviewData => {
            if (webviewData.url.includes(iOSAppPackagePath)) {
                return true;
            }
            if (!ionicLiveReload && webviewData.url.startsWith("ionic://")) {
                return true;
            }
            if (this.ionicDevServerUrls) {
                return (
                    this.ionicDevServerUrls.findIndex(url => webviewData.url.indexOf(url) === 0) >=
                    0
                );
            }
            return false;
        });
        return cordovaWebview || webviewsList[0];
    }

    private async attachmentCleanUp(): Promise<void> {
        // Clear the Ionic dev server URL if necessary
        if (this.ionicDevServerUrls) {
            this.ionicDevServerUrls = null;
        }

        this.cdpProxyErrorHandlerDescriptor?.dispose();
        if (this.cordovaCdpProxy) {
            await this.cordovaCdpProxy.stopServer();
            this.cordovaCdpProxy = null;
        }
    }

    private async cleanUp(restart?: boolean): Promise<void> {
        const errorLogger = message => this.outputLogger(message, true);

        if (this.browserProc) {
            this.browserProc.kill("SIGINT");
            // Workaround for issue https://github.com/microsoft/vscode-cordova/issues/766
            this.setChromeExitTypeNormal?.();
            this.browserProc = null;
        }

        // Stop ADB port forwarding if necessary
        let adbPortPromise: Promise<void>;

        if (this.adbPortForwardingInfo) {
            const adbForwardStopArgs = [
                "-s",
                this.adbPortForwardingInfo.targetDevice,
                "forward",
                "--remove",
                `tcp:${this.adbPortForwardingInfo.port}`,
            ];
            adbPortPromise = this.runAdbCommand(adbForwardStopArgs, errorLogger).then(() => void 0); // eslint-disable-line
        } else {
            adbPortPromise = Promise.resolve();
        }

        // Kill the Ionic dev server if necessary
        let killServePromise: Promise<void>;

        if (this.ionicLivereloadProcess) {
            this.ionicLivereloadProcess.removeAllListeners("exit");
            killServePromise = killChildProcess(this.ionicLivereloadProcess).finally(() => {
                this.ionicLivereloadProcess = null;
            });
        } else {
            killServePromise = Promise.resolve();
        }

        await this.attachmentCleanUp();

        // Close the simulate debug-host socket if necessary
        if (this.simulateDebugHost) {
            this.simulateDebugHost.close();
            this.simulateDebugHost = null;
        }

        this.cancellationTokenSource.cancel();
        this.cancellationTokenSource.dispose();

        // Stop IWDP if necessary
        CordovaIosDeviceLauncher.cleanup();

        this.onDidTerminateDebugSessionHandler.dispose();
        this.sessionManager.terminate(this.cordovaSession.getSessionId(), !!restart);

        await logger.dispose();

        // Wait on all the cleanups
        return adbPortPromise.finally(() => killServePromise);
    }

    /**
     * Starts an Ionic livereload server ("serve" or "run / emulate --livereload"). Returns a promise fulfilled with the full URL to the server.
     */
    private startIonicDevServer(
        launchArgs: ICordovaLaunchRequestArgs,
        cliArgs: string[],
    ): Promise<string[]> {
        enum IonicDevServerStatus {
            ServerReady,
            AppReady,
        }

        if (!launchArgs.runArguments || launchArgs.runArguments.length === 0) {
            if (launchArgs.devServerAddress) {
                cliArgs.push("--address", launchArgs.devServerAddress);
            }

            if (launchArgs.hasOwnProperty("devServerPort")) {
                if (
                    typeof launchArgs.devServerPort === "number" &&
                    launchArgs.devServerPort >= 0 &&
                    launchArgs.devServerPort <= 65535
                ) {
                    cliArgs.push("--port", launchArgs.devServerPort.toString());
                } else {
                    return Promise.reject(
                        new Error(
                            localize(
                                "TheValueForDevServerPortMustBeInInterval",
                                'The value for "devServerPort" must be a number between 0 and 65535', // eslint-disable-line
                            ),
                        ),
                    );
                }
            }
        }

        const isServe: boolean = cliArgs[0] === "serve";
        const errorRegex = /error:.*/i;
        const ionicLivereloadProcessStatus = {
            serverReady: false,
            appReady: false,
        };
        const serverReadyTimeout: number = launchArgs.devServerTimeout || 60000;
        const appReadyTimeout: number = launchArgs.devServerTimeout || 120000; // If we're not serving, the app needs to build and deploy (and potentially start the emulator), which can be very long
        let serverOut = "";
        let serverErr = "";
        const ansiRegex = /[\u001b\u009b][#();?[]*(?:\d{1,4}(?:;\d{0,4})*)?[\d<=>A-ORZcf-nqry]/g;
        const isIonic4: boolean = CordovaProjectHelper.isIonicCliVersionGte(
            launchArgs.cwd,
            "4.0.0",
        );
        const getServerErrorMessage = (channel: string) => {
            // Skip Ionic 4 searching port errors because, actually, they are not errors
            // https://github.com/ionic-team/ionic-cli/blob/4ee312ad983922ff4398b5900dcfcaebb6ef57df/packages/%40ionic/utils-network/src/index.ts#L85
            if (isIonic4) {
                const skipErrorMatch = /utils-network error while checking/.test(channel);
                if (skipErrorMatch) {
                    return null;
                }
            }

            const errorMatch = errorRegex.exec(channel);

            if (errorMatch) {
                return localize(
                    "ErrorInTheIonicLiveReloadServer",
                    "Error in the Ionic live reload server: {0}",
                    os.EOL + errorMatch[0],
                );
            }

            return null;
        };

        const getRegexToResolveAppDefer = (cliArgs: string[]): RegExp => {
            // Now that the server is ready, listen for the app to be ready as well. For "serve", this is always true, because no build and deploy is involved. For android, we need to
            // wait until we encounter the "launch success", for iOS device, the server output is different and instead we need to look for:
            //
            // ios devices:
            // (lldb)     run
            // success
            //
            // ios simulators:
            // "build succeeded"

            const isIosDevice: boolean = cliArgs.includes("ios") && cliArgs.includes("--device");
            const isIosSimulator: boolean =
                cliArgs.includes("ios") && cliArgs.includes("--emulator");
            const iosDeviceAppReadyRegex = /created bundle at path|\(lldb\)\W+run\r?\nsuccess/i;
            const iosSimulatorAppReadyRegex = /build succeeded|native-run ios/i;
            const appReadyRegex = /launch success|run successful/i;

            if (isIosDevice) {
                return iosDeviceAppReadyRegex;
            }

            if (isIosSimulator) {
                return iosSimulatorAppReadyRegex;
            }

            return appReadyRegex;
        };

        const command =
            launchArgs.cordovaExecutable || CordovaProjectHelper.getCliCommand(launchArgs.cwd);

        this.ionicLivereloadProcess = cordovaStartCommand(
            command,
            cliArgs,
            launchArgs.allEnv,
            launchArgs.cwd,
        );

        const serverStarting = new Promise((_resolve, reject) => {
            let rejectTimeout = setTimeout(() => {
                reject(
                    localize(
                        "StartingIonicDevServerTimedOut",
                        "Starting the Ionic dev server timed out ({0} ms)",
                        serverReadyTimeout,
                    ),
                );
            }, serverReadyTimeout);

            const resolveIfPossible = (ready: IonicDevServerStatus, serverUrls?: string[]) => {
                if (
                    ready === IonicDevServerStatus.ServerReady &&
                    !ionicLivereloadProcessStatus.serverReady
                ) {
                    clearTimeout(rejectTimeout);
                    ionicLivereloadProcessStatus.serverReady = true;
                    this.outputLogger("Building and deploying app");
                    rejectTimeout = setTimeout(() => {
                        reject(
                            localize(
                                "BuildingAndDeployingTheAppTimedOut",
                                "Building and deploying the app timed out ({0} ms)",
                                appReadyTimeout,
                            ),
                        );
                    }, appReadyTimeout);
                } else if (
                    ready === IonicDevServerStatus.AppReady &&
                    ionicLivereloadProcessStatus.serverReady
                ) {
                    clearTimeout(rejectTimeout);
                    ionicLivereloadProcessStatus.appReady = true;
                    _resolve(serverUrls);
                }
            };

            this.ionicLivereloadProcess.on("error", (err: { code: string }) => {
                if (err.code === "ENOENT") {
                    reject(
                        new Error(
                            localize(
                                "IonicNotFound",
                                "Ionic not found, please run 'npm install –g ionic' to install it globally",
                            ),
                        ),
                    );
                } else {
                    reject(err);
                }
            });
            this.ionicLivereloadProcess.on(
                "exit",
                (() => {
                    this.ionicLivereloadProcess = null;

                    let exitMessage = "The Ionic live reload server exited unexpectedly";
                    const errorMsg = getServerErrorMessage(serverErr);

                    if (errorMsg) {
                        // The Ionic live reload server has an error; check if it is related to the devServerAddress to give a better message
                        if (
                            errorMsg.includes("getaddrinfo ENOTFOUND") ||
                            errorMsg.includes("listen EADDRNOTAVAIL")
                        ) {
                            exitMessage +=
                                os.EOL +
                                localize(
                                    "InvalidAddress",
                                    'Invalid address: please provide a valid IP address or hostname for the "devServerAddress" property in launch.json', // eslint-disable-line
                                );
                        } else {
                            exitMessage += os.EOL + errorMsg;
                        }
                    }

                    if (
                        !ionicLivereloadProcessStatus.serverReady &&
                        !ionicLivereloadProcessStatus.appReady
                    ) {
                        // We are already debugging; disconnect the session
                        this.outputLogger(exitMessage, true);
                        this.stop();
                        throw new Error(exitMessage);
                    } else {
                        // The Ionic dev server wasn't ready yet, so reject its promises
                        reject(new Error(exitMessage));
                    }
                }).bind(this),
            );

            const serverOutputHandler = (data: Buffer) => {
                serverOut += data.toString();
                this.outputLogger(data.toString(), "stdout");

                // Listen for the server to be ready. We check for the "Running dev server:  http://localhost:<port>/" and "dev server running: http://localhost:<port>/" strings to decide that.

                // Example output of Ionic 1 dev server:
                //
                // [OK] Development server running!
                //      Local: http://localhost:8100
                //      External: http://10.0.75.1:8100, http://172.28.124.161:8100, http://169.254.80.80:8100, http://192.169.8.39:8100

                // Example output of Ionic 2 dev server:
                //
                // Running live reload server: undefined
                // Watching: 0=www/**/*, 1=!www/lib/**/*
                // Running dev server:  http://localhost:8100
                // Ionic server commands, enter:
                // restart or r to restart the client app from the root
                // goto or g and a url to have the app navigate to the given url
                // consolelogs or c to enable/disable console log output
                // serverlogs or s to enable/disable server log output
                // quit or q to shutdown the server and exit
                //
                // ionic $

                // Example output of Ionic dev server (for Ionic2):
                //
                // > ionic-hello-world@ ionic:serve <path>
                // > ionic-app-scripts serve "--v2" "--address" "0.0.0.0" "--port" "8100" "--livereload-port" "35729"
                // ionic-app-scripts
                // watch started
                // build dev started
                // clean started
                // clean finished
                // copy started
                // transpile started
                // transpile finished
                // webpack started
                // copy finished
                // webpack finished
                // sass started
                // sass finished
                // build dev finished
                // watch ready
                // dev server running: http://localhost:8100/

                const SERVER_URL_RE =
                    /(dev server running|running dev server|local):.*(http:\/\/.\S*)/gim;
                const localServerMatchResult = SERVER_URL_RE.exec(serverOut);
                if (!ionicLivereloadProcessStatus.serverReady && localServerMatchResult) {
                    resolveIfPossible(IonicDevServerStatus.ServerReady);
                }

                if (
                    ionicLivereloadProcessStatus.serverReady &&
                    !ionicLivereloadProcessStatus.appReady
                ) {
                    const regex: RegExp = getRegexToResolveAppDefer(cliArgs);

                    if (isServe || regex.test(serverOut)) {
                        const serverUrls = [localServerMatchResult[2]];
                        const externalUrls = /external:\s(.*)$/im.exec(serverOut);
                        if (externalUrls) {
                            const urls = externalUrls[1].split(", ").map(x => x.trim());
                            serverUrls.push(...urls);
                        }
                        launchArgs.devServerPort = CordovaProjectHelper.getPortFromURL(
                            serverUrls[0],
                        );
                        resolveIfPossible(IonicDevServerStatus.AppReady, serverUrls);
                    }
                }

                if (/Multiple network interfaces detected/.test(serverOut)) {
                    // Ionic does not know which address to use for the dev server, and requires human interaction; error out and let the user know
                    let errorMessage: string = localize(
                        "YourMachineHasMultipleNetworkAddresses",
                        `Your machine has multiple network addresses. Please specify which one your device or emulator will use to communicate with the dev server by adding a \"devServerAddress\": \"ADDRESS\" property to .vscode/launch.json.
    To get the list of addresses run "ionic cordova run PLATFORM --livereload" (where PLATFORM is platform name to run) and wait until prompt with this list is appeared.`,
                    );
                    const addresses: string[] = [];
                    const addressRegex = /(\d+\) .*)/gm;
                    let match: string[] = addressRegex.exec(serverOut);

                    while (match) {
                        addresses.push(match[1]);
                        match = addressRegex.exec(serverOut);
                    }

                    if (addresses.length > 0) {
                        // Give the user the list of addresses that Ionic found
                        // NOTE: since ionic started to use inquirer.js for showing _interactive_ prompts this trick does not work as no output
                        // of prompt are sent from ionic process which we starts with --no-interactive parameter
                        errorMessage += [localize("AvailableAdresses", " Available addresses:")]
                            .concat(addresses)
                            .join(`${os.EOL} `);
                    }

                    reject(new Error(errorMessage));
                }

                const errorMsg = getServerErrorMessage(serverOut);

                if (errorMsg) {
                    reject(new Error(errorMsg));
                }
            };

            const serverErrorOutputHandler = (data: Buffer) => {
                serverErr += data.toString();

                const errorMsg = getServerErrorMessage(serverErr);

                if (errorMsg) {
                    reject(new Error(errorMsg));
                }
            };

            this.ionicLivereloadProcess.stdout.on("data", serverOutputHandler);
            this.ionicLivereloadProcess.stderr.on("data", (data: Buffer) => {
                if (isIonic4) {
                    // Ionic 4 writes all logs to stderr completely ignoring stdout
                    serverOutputHandler(data);
                }
                serverErrorOutputHandler(data);
            });

            this.outputLogger(
                localize(
                    "StartingIonicDevServer",
                    "Starting Ionic dev server (live reload: {0})",
                    launchArgs.ionicLiveReload,
                ),
            );
        });

        return serverStarting.then((ionicDevServerUrls: string[]) => {
            if (!ionicDevServerUrls || !ionicDevServerUrls.length) {
                throw new Error(
                    localize(
                        "UnableToDetermineTheIonicDevServerAddress",
                        "Unable to determine the Ionic dev server address, please try re-launching the debugger",
                    ),
                );
            }

            // The dev server address is the captured group at index 1 of the match
            this.ionicDevServerUrls = ionicDevServerUrls;

            // When ionic 2 cli is installed, output includes ansi characters for color coded output.
            this.ionicDevServerUrls = this.ionicDevServerUrls.map(url =>
                url.replace(ansiRegex, ""),
            );
            return this.ionicDevServerUrls;
        });
    }

    private async launchChromiumBasedBrowser(args: ICordovaLaunchRequestArgs): Promise<void> {
        const port = args.port || 9222;
        const chromeArgs: string[] = [`--remote-debugging-port=${port}`];

        chromeArgs.push(...["--no-first-run", "--no-default-browser-check"]);
        if (args.runtimeArgs) {
            chromeArgs.push(...args.runtimeArgs);
        }

        if (args.userDataDir) {
            chromeArgs.push(`--user-data-dir=${args.userDataDir}`);
        }

        const launchUrl = args.url;
        chromeArgs.push(launchUrl);

        let browserFinder;
        switch (args.target) {
            case TargetType.Edge:
                browserFinder = new browserHelper.EdgeBrowserFinder(
                    process.env,
                    fs.promises,
                    execa,
                );
                break;
            case TargetType.Chrome:
            default:
                browserFinder = new browserHelper.ChromeBrowserFinder(
                    process.env,
                    fs.promises,
                    execa,
                );
        }

        const browserPath = await browserFinder.findAll();
        if (browserPath[0]) {
            this.browserProc = child_process.spawn(browserPath[0].path, chromeArgs, {
                detached: true,
                stdio: ["ignore"],
            });
            this.browserProc.unref();
            this.browserProc.on("error", err => {
                const errMsg = localize("ChromeError", "Chrome error: {0}", err.message);
                this.outputLogger(errMsg, true);
                this.stop();
            });
            this.setChromeExitTypeNormal = this.setChromeExitTypeNormalByUserDataDir.bind(
                this,
                args.userDataDir,
            );

            this.vsCodeDebugSession.customRequest("attach", args);
        }
    }

    private setChromeExitTypeNormalByUserDataDir(userDataDir: string) {
        try {
            const preferencesPath = path.resolve(userDataDir, "Default", "Preferences");
            const browserPrefs = JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
            browserPrefs.profile.exit_type = "normal";
            fs.writeFileSync(preferencesPath, JSON.stringify(browserPrefs));
        } catch (error) {
            this.outputLogger("Warning: Failed to set normal exit type for Chrome browser");
        }
    }

    private launchServe(
        launchArgs: ICordovaLaunchRequestArgs,
        projectType: ProjectType,
        runArguments: string[],
    ): Promise<void> {
        const errorLogger = message => this.outputLogger(message, true);

        // Currently, "ionic serve" is only supported for Ionic projects
        if (!projectType.isIonic) {
            const errorMessage = localize(
                "ServingToTheBrowserIsSupportedForIonicProjects",
                "Serving to the browser is currently only supported for Ionic projects",
            );

            errorLogger(errorMessage);

            return Promise.reject(new Error(errorMessage));
        }

        const args = ["serve"];

        if (launchArgs.runArguments && launchArgs.runArguments.length > -1) {
            args.push(...launchArgs.runArguments);
        } else if (runArguments && runArguments.length) {
            args.push(...runArguments);
        } else {
            // Set up "ionic serve" args
            args.push("--nobrowser");

            if (!launchArgs.ionicLiveReload) {
                args.push("--nolivereload");
            }
        }

        // Deploy app to browser
        return this.startIonicDevServer(launchArgs, args).then((devServerUrls: string[]) => {
            // Prepare Chrome launch args
            launchArgs.url = devServerUrls[0];
            launchArgs.userDataDir = path.join(settingsHome(), CordovaDebugSession.CHROME_DATA_DIR);

            // Launch Chrome and attach
            return this.launchChromiumBasedBrowser(launchArgs);
        });
    }

    private getErrorMessage(e: any): string {
        return e.message || e.error || e.data || e;
    }

    private async getCommandLineArgsForAndroidTarget(
        launchArgs: ICordovaLaunchRequestArgs,
    ): Promise<string[]> {
        let targetArgs: string[] = ["--verbose"];

        const useDefaultCLI = async () => {
            this.outputLogger("Continue using standard CLI workflow.");
            targetArgs = ["--verbose"];
            const adbHelper = new AdbHelper(launchArgs.cwd);
            const debuggableDevices = await adbHelper.getOnlineTargets();
            // By default, if the target is not specified, Cordova CLI uses the first online target from ‘adb devices’ list (launched emulators are placed after devices).
            // For more information, see https://github.com/apache/cordova-android/blob/bb7d733cdefaa9ed36ec355a42f8224da610a26e/bin/templates/cordova/lib/run.js#L57-L68
            launchArgs.target = debuggableDevices.length
                ? debuggableDevices[0].id
                : TargetType.Emulator;
        };

        try {
            const target = await this.resolveAndroidTarget(launchArgs, false);
            if (target) {
                targetArgs.push(target.isVirtualTarget ? "--emulator" : "--device");
                targetArgs.push(`--target=${target.id}`);
            } else {
                this.outputLogger(`Could not find debugable target '${launchArgs.target}'.`, true);
                await useDefaultCLI();
            }
        } catch (error) {
            this.outputLogger(error.message || error, true);
            await useDefaultCLI();
        }

        return targetArgs;
    }

    private async resolveAndroidTarget(
        configArgs: ICordovaLaunchRequestArgs | ICordovaAttachRequestArgs,
        isAttachScenario: boolean,
    ): Promise<AndroidTarget | undefined> {
        const adbHelper = new AdbHelper(configArgs.cwd);

        const getFirstOnlineAndroidTarget = async (): Promise<AndroidTarget | undefined> => {
            const onlineTargets = await adbHelper.getOnlineTargets();
            if (onlineTargets.length) {
                const firstDevice = onlineTargets[0];
                configArgs.target = firstDevice.id;
                return AndroidTarget.fromInterface(firstDevice);
            }
        };

        if (configArgs.target) {
            const androidEmulatorManager = new AndroidTargetManager(adbHelper);
            const isAnyEmulator = configArgs.target.toLowerCase() === TargetType.Emulator;
            const isAnyDevice = configArgs.target.toLowerCase() === TargetType.Device;
            const isVirtualTarget = await androidEmulatorManager.isVirtualTarget(configArgs.target);

            const saveResult = async (target: AndroidTarget): Promise<void> => {
                const launchScenariousManager = new LaunchScenariosManager(configArgs.cwd);
                if (isAttachScenario) {
                    // Save the selected target for attach scenario only if there are more then one online target
                    const onlineDevices = await adbHelper.getOnlineTargets();
                    if (
                        onlineDevices.filter(
                            device => target.isVirtualTarget === device.isVirtualTarget,
                        ).length > 1
                    ) {
                        launchScenariousManager.updateLaunchScenario(configArgs, {
                            target: target.name,
                        });
                    }
                } else {
                    launchScenariousManager.updateLaunchScenario(configArgs, {
                        target: target.name,
                    });
                }
            };

            await androidEmulatorManager.collectTargets(
                isVirtualTarget ? TargetType.Emulator : TargetType.Device,
            );
            let targetDevice = await androidEmulatorManager.selectAndPrepareTarget(target => {
                const conditionForAttachScenario = isAttachScenario ? target.isOnline : true;
                const conditionForNotAnyTarget =
                    isAnyEmulator || isAnyDevice
                        ? true
                        : target.name === configArgs.target || target.id === configArgs.target;
                const conditionForVirtualTarget = isVirtualTarget === target.isVirtualTarget;
                return (
                    conditionForVirtualTarget &&
                    conditionForNotAnyTarget &&
                    conditionForAttachScenario
                );
            });
            if (targetDevice) {
                if (isAnyEmulator || isAnyDevice) {
                    await saveResult(targetDevice);
                }
                configArgs.target = targetDevice.id;
            } else if (isAttachScenario && (isAnyEmulator || isAnyDevice)) {
                this.outputLogger(
                    "Target has not been selected. Trying to use the first online Android device",
                );
                targetDevice = await getFirstOnlineAndroidTarget();
            }

            return targetDevice;
        }
        // If there is no a target in debug config, use the first online device
        const targetDevice = await getFirstOnlineAndroidTarget();
        if (!targetDevice) {
            throw new Error(
                localize(
                    "ThereIsNoAnyOnlineDebuggableDevice",
                    "The 'target' parameter in the debug configuration is undefined, and there are no any online debuggable targets",
                ),
            );
        }
        return targetDevice;
    }

    private async resolveIOSTarget(
        configArgs: ICordovaLaunchRequestArgs | ICordovaAttachRequestArgs,
        isAttachScenario: boolean,
    ): Promise<IOSTarget | undefined> {
        const getFirstOnlineIOSTarget = async (): Promise<IOSTarget | undefined> => {
            const onlineTargets = await this.iOSTargetManager.getOnlineTargets();
            if (onlineTargets.length) {
                const firstDevice = onlineTargets[0];
                configArgs.target = firstDevice.id;
                return firstDevice;
            }
        };

        if (configArgs.target) {
            const isAnyEmulator = configArgs.target.toLowerCase() === TargetType.Emulator;
            const isAnyDevice = configArgs.target.toLowerCase() === TargetType.Device;
            const isVirtualTarget = await this.iOSTargetManager.isVirtualTarget(configArgs.target);

            const saveResult = async (target: AndroidTarget): Promise<void> => {
                const launchScenariousManager = new LaunchScenariosManager(configArgs.cwd);
                if (isAttachScenario) {
                    // Save the selected target for attach scenario only if there are more then one online target
                    const onlineDevices = await this.iOSTargetManager.getOnlineTargets();
                    if (
                        onlineDevices.filter(
                            device => target.isVirtualTarget === device.isVirtualTarget,
                        ).length > 1
                    ) {
                        launchScenariousManager.updateLaunchScenario(configArgs, {
                            target: target.id,
                        });
                    }
                } else {
                    launchScenariousManager.updateLaunchScenario(configArgs, {
                        target: target.id,
                    });
                }
            };

            await this.iOSTargetManager.collectTargets(
                isVirtualTarget ? TargetType.Emulator : TargetType.Device,
            );
            let targetDevice = await this.iOSTargetManager.selectAndPrepareTarget(target => {
                const conditionForAttachScenario = isAttachScenario ? target.isOnline : true;
                const conditionForNotAnyTarget =
                    isAnyEmulator || isAnyDevice
                        ? true
                        : target.name === configArgs.target || target.id === configArgs.target;
                const conditionForVirtualTarget = isVirtualTarget === target.isVirtualTarget;
                return (
                    conditionForVirtualTarget &&
                    conditionForNotAnyTarget &&
                    conditionForAttachScenario
                );
            });
            if (targetDevice) {
                if (isAnyEmulator || isAnyDevice) {
                    await saveResult(targetDevice);
                }
                configArgs.target = targetDevice.id;
            } else if (isAttachScenario && (isAnyEmulator || isAnyDevice)) {
                this.outputLogger(
                    "Target has not been selected. Trying to use the first online iOS device",
                );
                targetDevice = await getFirstOnlineIOSTarget();
            }

            return targetDevice;
        }
        // If there is no a target in debug config, use the first online device
        const targetDevice = await getFirstOnlineIOSTarget();
        if (!targetDevice) {
            throw new Error(
                localize(
                    "ThereIsNoAnyOnlineDebuggableDevice",
                    "The 'target' parameter in the debug configuration is undefined, and there are no any online debuggable targets",
                ),
            );
        }
        return targetDevice;
    }

    private async launchAndroid(
        launchArgs: ICordovaLaunchRequestArgs,
        projectType: ProjectType,
        runArguments: string[],
    ): Promise<void> {
        const workingDirectory = launchArgs.cwd;

        // Prepare the command line args
        const args = ["run", "android"];

        if (launchArgs.runArguments && launchArgs.runArguments.length > 0) {
            args.push(...launchArgs.runArguments);
        } else if (runArguments && runArguments.length) {
            args.push(...runArguments);
        } else {
            const targetArgs = await this.getCommandLineArgsForAndroidTarget(launchArgs);
            args.push(...targetArgs);

            // Verify if we are using Ionic livereload
            if (launchArgs.ionicLiveReload) {
                if (projectType.isIonic) {
                    // Livereload is enabled, let Ionic do the launch
                    args.push("--livereload");
                } else {
                    this.outputLogger(CordovaDebugSession.NO_LIVERELOAD_WARNING);
                }
            }
        }

        if (args.includes("--livereload")) {
            return this.startIonicDevServer(launchArgs, args).then(() => undefined);
        }
        const command =
            launchArgs.cordovaExecutable || CordovaProjectHelper.getCliCommand(workingDirectory);
        const cordovaResult = cordovaRunCommand(
            command,
            args,
            launchArgs.allEnv,
            workingDirectory,
            this.outputLogger,
        ).then(output => {
            const runOutput = output[0];
            const stderr = output[1];

            // Ionic ends process with zero code, so we need to look for
            // strings with error content to detect failed process
            const errorMatch = /(ERROR.*)/.exec(runOutput) || /error:.*/i.exec(stderr);
            if (errorMatch) {
                // TODO remove this handler after the issue https://github.com/ionic-team/ionic-cli/issues/4809 is resolved
                const errorOutputJsonPattern = new RegExp(
                    `Error: ENOENT: no such file or directory.*\\${path.sep}output\.json`,
                    "mi",
                );
                if (!errorOutputJsonPattern.test(errorMatch[0])) {
                    throw new Error(localize("ErrorRunningAndroid", "Error running android"));
                }
            }

            this.outputLogger(localize("AppSuccessfullyLaunched", "App successfully launched"));
        });

        return cordovaResult;
    }

    private attachAndroid(
        attachArgs: ICordovaAttachRequestArgs,
    ): Promise<ICordovaAttachRequestArgs> {
        const errorLogger = (message: string) => this.outputLogger(message, true);

        // Determine which device/emulator we are targeting
        const resolveTagetPromise = new Promise<string>(async (resolve, reject) => {
            try {
                const devicesOutput = await this.runAdbCommand(["devices"], errorLogger);
                try {
                    const result = await this.resolveAndroidTarget(attachArgs, true);
                    if (!result) {
                        errorLogger(devicesOutput);
                        reject(new Error(`Unable to find target ${attachArgs.target}`));
                    }
                    resolve(result.id);
                } catch (error) {
                    reject(error);
                }
            } catch (error) {
                const errorCode: string = (<any>error).code;
                if (errorCode && errorCode === "ENOENT") {
                    throw new Error(
                        localize(
                            "UnableToFindAdb",
                            "Unable to find adb. Please ensure it is in your PATH and re-open Visual Studio Code",
                        ),
                    );
                }
                throw error;
            }
        });

        const packagePromise: Promise<string> = fs.promises
            .readFile(path.join(attachArgs.cwd, ANDROID_MANIFEST_PATH))
            .catch(err => {
                if (err && err.code === "ENOENT") {
                    return fs.promises.readFile(path.join(attachArgs.cwd, ANDROID_MANIFEST_PATH_8));
                }
                throw err;
            })
            .then(manifestContents => {
                const parsedFile = elementtree.XML(manifestContents.toString());
                const packageKey = "package";
                return parsedFile.attrib[packageKey];
            });

        return Promise.all([packagePromise, resolveTagetPromise])
            .then(([appPackageName, targetDevice]) => {
                const pidofCommandArguments = [
                    "-s",
                    targetDevice,
                    "shell",
                    "pidof",
                    appPackageName,
                ];
                const getPidCommandArguments = ["-s", targetDevice, "shell", "ps"];
                const getSocketsCommandArguments = [
                    "-s",
                    targetDevice,
                    "shell",
                    "cat /proc/net/unix",
                ];

                const findAbstractNameFunction = () =>
                    // Get the pid from app package name
                    this.runAdbCommand(pidofCommandArguments, errorLogger)
                        .then(pid => {
                            if (pid && /^\d+$/.test(pid.trim())) {
                                return pid.trim();
                            }

                            throw Error(CordovaDebugSession.pidofNotFoundError);
                        })
                        .catch(err => {
                            if (err.message !== CordovaDebugSession.pidofNotFoundError) {
                                return;
                            }

                            return this.runAdbCommand(getPidCommandArguments, errorLogger).then(
                                psResult => {
                                    const lines = psResult.split("\n");
                                    const keys = lines.shift().split(PS_FIELDS_SPLITTER_RE);
                                    const nameIdx = keys.indexOf("NAME");
                                    const pidIdx = keys.indexOf("PID");
                                    for (const line of lines) {
                                        const fields = line
                                            .trim()
                                            .split(PS_FIELDS_SPLITTER_RE)
                                            .filter(field => !!field);
                                        if (fields.length < nameIdx) {
                                            continue;
                                        }
                                        if (fields[nameIdx] === appPackageName) {
                                            return fields[pidIdx];
                                        }
                                    }
                                },
                            );
                        })
                        // Get the "_devtools_remote" abstract name by filtering /proc/net/unix with process inodes
                        .then(pid =>
                            this.runAdbCommand(getSocketsCommandArguments, errorLogger).then(
                                getSocketsResult => {
                                    const lines = getSocketsResult.split("\n");
                                    const keys = lines.shift().split(/\s+/);
                                    const flagsIdx = keys.indexOf("Flags");
                                    const stIdx = keys.indexOf("St");
                                    const pathIdx = keys.indexOf("Path");
                                    for (const line of lines) {
                                        const fields = line.split(/\s+/);
                                        if (fields.length < 8) {
                                            continue;
                                        }
                                        // flag = 00010000 (16) -> accepting connection
                                        // state = 01 (1) -> unconnected
                                        if (
                                            fields[flagsIdx] !== "00010000" ||
                                            fields[stIdx] !== "01"
                                        ) {
                                            continue;
                                        }
                                        const pathField = fields[pathIdx];
                                        if (pathField.length < 1 || pathField[0] !== "@") {
                                            continue;
                                        }
                                        if (!pathField.includes("_devtools_remote")) {
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
                                },
                            ),
                        );

                return retryAsync(
                    findAbstractNameFunction,
                    match => !!match,
                    5,
                    1,
                    5000,
                    localize(
                        "UnableToFindLocalAbstractName",
                        "Unable to find 'localabstract' name of Cordova app",
                    ),
                    this.cancellationTokenSource.token,
                ).then(abstractName => {
                    // Configure port forwarding to the app
                    const forwardSocketCommandArguments = [
                        "-s",
                        targetDevice,
                        "forward",
                        `tcp:${attachArgs.port}`,
                        `localabstract:${abstractName}`,
                    ];
                    this.outputLogger(localize("ForwardingDebugPort", "Forwarding debug port"));
                    return this.runAdbCommand(forwardSocketCommandArguments, errorLogger).then(
                        () => {
                            this.adbPortForwardingInfo = {
                                targetDevice,
                                port: attachArgs.port,
                            };
                        },
                    );
                });
            })
            .then(() => {
                return attachArgs;
            });
    }

    private showError(error: Error): void {
        void vscode.window.showErrorMessage(error.message, {
            modal: true,
        });
        // We can't print error messages via debug session logger after the session is stopped. This could break the extension work.
        if (this.debugSessionStatus === DebugSessionStatus.Stopped) {
            OutputChannelLogger.getMainChannel().log(error.message);
            return;
        }
        this.outputLogger(error.message, true);
    }

    private async terminate(): Promise<void> {
        await vscode.commands.executeCommand(this.stopCommand, undefined, {
            sessionId: this.vsCodeDebugSession.id,
        });
    }
}
