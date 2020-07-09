// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {
    Connection,
    Server,
    WebSocketTransport
} from "vscode-cdp-proxy";
import { IncomingMessage } from "http";
import { OutputChannelLogger } from "../../utils/OutputChannelLogger";
import { DebuggerEndpointHelper } from "./debuggerEndpointHelper";
import { CancellationToken } from "vscode";
import { CDP_API_NAMES } from "./CDPAPINames";
import { SourcemapPathTransformer } from "./sourcemapPathTransformer";
import { IProjectType } from "../../utils/cordovaProjectHelper";
import { CordovaProjectHelper } from "../../utils/cordovaProjectHelper";

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
    private cancellationToken: CancellationToken | undefined;
    private sourcemapPathTransformer: SourcemapPathTransformer;
    private projectType: IProjectType;

    constructor(hostAddress: string, port: number, sourcemapPathTransformer: SourcemapPathTransformer, projectType: IProjectType) {
        this.port = port;
        this.hostAddress = hostAddress;
        this.sourcemapPathTransformer = sourcemapPathTransformer;
        this.projectType = projectType;
        this.logger = OutputChannelLogger.getChannel("Cordova Chrome Proxy", true, false);
        this.debuggerEndpointHelper = new DebuggerEndpointHelper();
    }

    public createServer(cancellationToken: CancellationToken): Promise<void> {
        this.cancellationToken = cancellationToken;
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

    private handleDebuggerTargetCommand(evt: any) {
        console.log(this.PROXY_LOG_TAGS.DEBUGGER_COMMAND + JSON.stringify(evt, null , 2));
        // this.logger.logWithCustomTag(this.PROXY_LOG_TAGS.DEBUGGER_COMMAND, JSON.stringify(evt, null , 2), this.logLevel);
        this.applicationTarget.send(evt);
    }

    private handleApplicationTargetCommand(evt: any) {
        console.log(this.PROXY_LOG_TAGS.APPLICATION_COMMAND + JSON.stringify(evt, null , 2));
        // this.logger.logWithCustomTag(this.PROXY_LOG_TAGS.APPLICATION_COMMAND, JSON.stringify(evt, null , 2), this.logLevel);

        if (
            evt.method === CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED
            && evt.params.url
            && evt.params.url.startsWith("http://localhost")
        ) {
            evt.params = this.fixSourcemapLocation(evt.params);
        }

        this.debuggerTarget.send(evt);
    }

    private handleDebuggerTargetReply(evt: any) {
        console.log(this.PROXY_LOG_TAGS.DEBUGGER_REPLY + JSON.stringify(evt, null , 2));
        // this.logger.logWithCustomTag(this.PROXY_LOG_TAGS.DEBUGGER_REPLY, JSON.stringify(evt, null , 2), this.logLevel);

        if (
            evt.method === CDP_API_NAMES.DEBUGGER_SET_BREAKPOINT_BY_URL
            && CordovaProjectHelper.isIonicAngularProjectByProjectType(this.projectType)
        ) {
            evt.params = this.fixIonicSourcemapRegexp(evt.params);
        }

        this.applicationTarget.send(evt);
    }

    private handleApplicationTargetReply(evt: any) {
        console.log(this.PROXY_LOG_TAGS.APPLICATION_REPLY + JSON.stringify(evt, null , 2));
        // this.logger.logWithCustomTag(this.PROXY_LOG_TAGS.APPLICATION_REPLY, JSON.stringify(evt, null , 2), this.logLevel);
        this.debuggerTarget.send(evt);
    }

    private onDebuggerTargetError(err: Error) {
        this.logger.log(`Error on debugger transport: ${err}`);
    }

    private onApplicationTargetError(err: Error) {
        this.logger.log(`Error on application transport: ${err}`);
    }

    private fixSourcemapLocation(reqParams: any): any {
        let absoluteSourcePath = this.sourcemapPathTransformer.getClientPath(reqParams.url);
        if (process.platform === "win32") {
            reqParams.url = "file:///" + absoluteSourcePath.split("\\").join("/"); // transform to URL standard
        } else {
            reqParams.url = "file://" + absoluteSourcePath;
        }
        return reqParams;
    }

    private fixIonicSourcemapRegexp(reqParams: any): any {
        const regExp = process.platform === "win32" ?
            /.*\\\\\[wW\]\[wW\]\[wW\]\\\\(.*\\.\[jJ\]\[sS\])/g :
            /.*\\\/www\\\/(.*\.js)/g;
        let foundStrings = regExp.exec(reqParams.urlRegex);
        if (foundStrings && foundStrings[1]) {
            const uriPart = foundStrings[1].split("\\\\").join("\\/");
            reqParams.urlRegex = "http:\\/\\/localhost\\/" + uriPart;
        }
        return reqParams;
    }
}
