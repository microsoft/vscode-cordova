// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {
    Connection,
    Server,
    WebSocketTransport
} from "vscode-cdp-proxy";
import { IncomingMessage } from "http";
import { OutputChannelLogger } from "../../utils/log/outputChannelLogger";
import { DebuggerEndpointHelper } from "./debuggerEndpointHelper";
import { LogLevel } from "../../utils/log/logHelper";
import { CancellationToken } from "vscode";
import { SourcemapPathTransformer } from "./sourcemapPathTransformer";
import { IProjectType } from "../../utils/cordovaProjectHelper";
import { CDPMessageHandlerBase } from "./CDPMessageHandlers/CDPMessageHandlerBase";
import { PureCDPMessageHandler } from "./CDPMessageHandlers/pureCDPMessageHandler";
import { TargetedCDPMessageHandler } from "./CDPMessageHandlers/targetedCDPMessageHandler";
import { ICordovaAttachRequestArgs } from "../requestArgs";

export class CordovaCDPProxy {

    private readonly PROXY_LOG_TAGS = {
        DEBUGGER_COMMAND: "Command Debugger To Target",
        APPLICATION_COMMAND: "Command Target To Debugger",
        DEBUGGER_REPLY: "Reply From Debugger To Target",
        APPLICATION_REPLY: "Reply From Target To Debugger",
    };

    private server: Server | null;
    private hostAddress: string;
    private port: number;
    private debuggerTarget: Connection;
    private applicationTarget: Connection;
    private logger: OutputChannelLogger;
    private debuggerEndpointHelper: DebuggerEndpointHelper;
    private applicationTargetPort: number;
    private logLevel: LogLevel;
    private cancellationToken: CancellationToken | undefined;
    private CDPMessageHandler: CDPMessageHandlerBase;

    constructor(
        hostAddress: string,
        port: number,
        sourcemapPathTransformer: SourcemapPathTransformer,
        projectType: IProjectType,
        args: ICordovaAttachRequestArgs,
        logLevel: LogLevel = LogLevel.None
    ) {
        this.port = port;
        this.hostAddress = hostAddress;
        this.logLevel = logLevel;
        this.logger = OutputChannelLogger.getChannel("Cordova Chrome Proxy", true, false, true);
        this.debuggerEndpointHelper = new DebuggerEndpointHelper();
        if (args.platform === "ios" && (args.target === "emulator" || args.target === "device")) {
            this.CDPMessageHandler = new TargetedCDPMessageHandler(sourcemapPathTransformer, projectType, args);
        } else {
            this.CDPMessageHandler = new PureCDPMessageHandler(sourcemapPathTransformer, projectType, args);
        }
    }

    public createServer(logLevel: LogLevel, cancellationToken: CancellationToken): Promise<void> {
        this.cancellationToken = cancellationToken;
        this.logLevel = logLevel;
        return Server.create({ port: this.port, host: this.hostAddress })
            .then((server: Server) => {
                this.server = server;
                this.server.onConnection(this.onConnectionHandler.bind(this));
            });
    }

    public async stopServer(): Promise<void> {
        if (this.applicationTarget) {
            await this.applicationTarget.close();
            this.applicationTarget = null;
        }
        if (this.server) {
            this.server.dispose();
            this.server = null;
        }
        this.cancellationToken = undefined;
    }

    public setApplicationTargetPort(applicationTargetPort: number): void {
        this.applicationTargetPort = applicationTargetPort;
    }

    private async onConnectionHandler([debuggerTarget]: [Connection, IncomingMessage]): Promise<void> {
        this.debuggerTarget = debuggerTarget;

        this.debuggerTarget.pause(); // don't listen for events until the target is ready
        let browserInspectUri: string;
        if (this.cancellationToken) {
            browserInspectUri = await this.debuggerEndpointHelper.retryGetWSEndpoint(
                `http://localhost:${this.applicationTargetPort}`,
                10,
                this.cancellationToken
            );
        } else {
            browserInspectUri = await this.debuggerEndpointHelper.getWSEndpoint(`http://localhost:${this.applicationTargetPort}`);
        }

        this.applicationTarget = new Connection(await WebSocketTransport.create(browserInspectUri));

        this.applicationTarget.onError(this.onApplicationTargetError.bind(this));
        this.debuggerTarget.onError(this.onDebuggerTargetError.bind(this));

        this.applicationTarget.onCommand(this.handleApplicationTargetCommand.bind(this));
        this.debuggerTarget.onCommand(this.handleDebuggerTargetCommand.bind(this));

        this.applicationTarget.onReply(this.handleApplicationTargetReply.bind(this));
        this.debuggerTarget.onReply(this.handleDebuggerTargetReply.bind(this));

        // this.debuggerTarget.onEnd(this.onDebuggerTargetClosed.bind(this));

        // dequeue any messages we got in the meantime
        this.debuggerTarget.unpause();
    }

    private handleDebuggerTargetCommand(event: any) {
        this.logger.logWithCustomTag(this.PROXY_LOG_TAGS.DEBUGGER_COMMAND, JSON.stringify(event, null , 2), this.logLevel);
        const processedMessage = this.CDPMessageHandler.processDebuggerCDPMessage(event);

        if (processedMessage.sendBack) {
            this.debuggerTarget?.send(processedMessage.event);
        } else {
            this.applicationTarget?.send(processedMessage.event);
        }
    }

    private handleApplicationTargetCommand(event: any) {
        this.logger.logWithCustomTag(this.PROXY_LOG_TAGS.APPLICATION_COMMAND, JSON.stringify(event, null , 2), this.logLevel);
        const processedMessage = this.CDPMessageHandler.processApplicationCDPMessage(event);

        if (processedMessage.sendBack) {
            this.applicationTarget?.send(processedMessage.event);
        } else {
            this.debuggerTarget?.send(processedMessage.event);
        }
    }

    private handleDebuggerTargetReply(event: any) {
        this.logger.logWithCustomTag(this.PROXY_LOG_TAGS.DEBUGGER_REPLY, JSON.stringify(event, null , 2), this.logLevel);
        const processedMessage = this.CDPMessageHandler.processDebuggerCDPMessage(event);

        if (processedMessage.sendBack) {
            this.debuggerTarget?.send(processedMessage.event);
        } else {
            this.applicationTarget?.send(processedMessage.event);
        }
    }

    private handleApplicationTargetReply(event: any) {
        this.logger.logWithCustomTag(this.PROXY_LOG_TAGS.APPLICATION_REPLY, JSON.stringify(event, null , 2), this.logLevel);
        const processedMessage = this.CDPMessageHandler.processApplicationCDPMessage(event);

        if (processedMessage.sendBack) {
            this.applicationTarget?.send(processedMessage.event);
        } else {
            this.debuggerTarget?.send(processedMessage.event);
        }
    }

    private onDebuggerTargetError(err: Error) {
        this.logger.log(`Error on debugger transport: ${err}`);
    }

    private onApplicationTargetError(err: Error) {
        this.logger.log(`Error on application transport: ${err}`);
    }
}
