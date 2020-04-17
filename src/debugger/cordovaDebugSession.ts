// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as Q from "q";
import * as path from "path";
import * as fs from "fs";
import { LoggingDebugSession, Logger, logger } from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { CordovaCDPProxy } from "./cdp-proxy/cordovaCDPProxy";

enum DebugSessionStatus {
    FirstConnection,
    FirstConnectionPending,
    ConnectionAllowed,
    ConnectionPending,
    ConnectionDone,
    ConnectionFailed,
}

export interface IAttachRequestArgs extends DebugProtocol.AttachRequestArguments, ILaunchArgs {
    cwd: string; /* Automatically set by VS Code to the currently opened folder */
    port: number;
    url?: string;
    address?: string;
    trace?: string;
}

export interface ILaunchRequestArgs extends DebugProtocol.LaunchRequestArguments, IAttachRequestArgs { }

export class CordovaDebugSession extends LoggingDebugSession {

    private readonly cdpProxyPort: number;
    private readonly cdpProxyHostAddress: string;
    private readonly terminateCommand: string;
    private readonly pwaNodeSessionName: string;

    private appLauncher: AppLauncher;
    private appWorker: MultipleLifetimesAppWorker | null;
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
        this.appWorker = null;
        this.rnCdpProxy = null;
        this.debugSessionStatus = DebugSessionStatus.FirstConnection;

        this.onDidStartDebugSessionHandler = vscode.debug.onDidStartDebugSession(
            this.handleStartDebugSession.bind(this)
        );

        this.onDidTerminateDebugSessionHandler = vscode.debug.onDidTerminateDebugSession(
            this.handleTerminateDebugSession.bind(this)
        );
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        super.initializeRequest(response, args);
    }

    protected launchRequest(response: DebugProtocol.LaunchResponse, launchArgs: ILaunchRequestArgs, request?: DebugProtocol.Request): Promise<void> {
    }

    protected attachRequest(response: DebugProtocol.AttachResponse, attachArgs: IAttachRequestArgs, request?: DebugProtocol.Request): Promise<void>  {

    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): void {
        // The client is about to disconnect so first we need to stop app worker
        if (this.appWorker) {
            this.appWorker.stop();
        }

        if (this.rnCdpProxy) {
            this.rnCdpProxy.stopServer();
            this.rnCdpProxy = null;
        }

        this.onDidStartDebugSessionHandler.dispose();
        this.onDidTerminateDebugSessionHandler.dispose();

        super.disconnectRequest(response, args, request);
    }

    private establishDebugSession(resolve?: (value?: void | PromiseLike<void> | undefined) => void): void {
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
                this.appLauncher.getWorkspaceFolder(),
                attachArguments,
                this.session
            )
            .then((childDebugSessionStarted: boolean) => {
                if (childDebugSessionStarted) {
                    this.debugSessionStatus = DebugSessionStatus.ConnectionDone;
                    if (resolve) {
                        this.debugSessionStatus = DebugSessionStatus.ConnectionAllowed;
                        resolve();
                    }
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
}
