// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as net from "net";
import * as Q from "q";
import {PluginSimulator} from "./simulate";
import {SimulateInfo} from "cordova-simulate";
import * as vscode from "vscode";

import {
    ErrorMarker,
    ExtensionMessage,
    ExtensionMessageSender,
    MessageWithArguments
} from "../common/extensionMessaging";

import {CordovaProjectHelper} from "../utils/cordovaProjectHelper";
import {Telemetry} from "../utils/telemetry";

export class ExtensionServer implements vscode.Disposable {
    private serverInstance: net.Server = null;
    private pluginSimulator: PluginSimulator;
    private messageHandlerDictionary: { [id: number]: ((...argArray: any[]) => Q.Promise<any>) } = {};
    private pipePath: string;

    public constructor() {
        this.pipePath = ExtensionMessageSender.getExtensionPipePath();

        // Register handlers for all messages
        this.messageHandlerDictionary[ExtensionMessage.SEND_TELEMETRY] = this.sendTelemetry;
        this.messageHandlerDictionary[ExtensionMessage.SIMULATE] = this.simulate;
    }

    /**
     * Starts the server.
     */
    public setup(): Q.Promise<void> {

        let deferred = Q.defer<void>();

        let launchCallback = (error: any) => {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(null);
            }
        };

        this.serverInstance = net.createServer(this.handleSocket.bind(this));
        this.serverInstance.on("error", this.recoverServer.bind(this));
        this.serverInstance.listen(this.pipePath, launchCallback);

        return deferred.promise;
    }

    /**
     * Stops the server.
     */
    public dispose(): void {
        if (this.serverInstance) {
            this.serverInstance.close();
            this.serverInstance = null;
        }

        if (this.pluginSimulator) {
            this.pluginSimulator.dispose();
            this.pluginSimulator = null;
        }
    }

    /**
     * Sends telemetry
     */
    private sendTelemetry(extensionId: string, extensionVersion: string, appInsightsKey: string, eventName: string, properties: { [key: string]: string }, measures: { [key: string]: number }): Q.Promise<any> {
        Telemetry.sendExtensionTelemetry(extensionId, extensionVersion, appInsightsKey, eventName, properties, measures);
        return Q.resolve({});
    }

    /**
     * Prepares for simulate debugging. The server and simulate host are launched here.
     * The application host is launched by the debugger.
     *
     * Returns the url of the sim-host.
     */
    private simulate(): Q.Promise<string> {
        var simInfo: SimulateInfo;

        if (!this.pluginSimulator) {
            this.pluginSimulator = new PluginSimulator();
        }

        return this.pluginSimulator.launchServer(vscode.workspace.rootPath)
            .then((simulateInfo: SimulateInfo) => {
                simInfo = simulateInfo;
                return this.pluginSimulator.launchSimHost();
            }).then(() => {
                return simInfo.appUrl;
            });
    }

    /**
     * Extension message handler.
     */
    private handleExtensionMessage(messageWithArgs: MessageWithArguments): Q.Promise<any> {
        let handler = this.messageHandlerDictionary[messageWithArgs.message];
        if (handler) {
            // Log.logInternalMessage(LogLevel.Info, "Handling message: " + em.ExtensionMessage[messageWithArgs.message]);
            return handler.apply(this, messageWithArgs.args);
        } else {
            return Q.reject("Invalid message: " + messageWithArgs.message);
        }
    }

    /**
     * Handles connections to the server.
     */
    private handleSocket(socket: net.Socket): void {
        let handleError = (e: any) => {
            // Log.logError("An error ocurred. ", e);
            socket.end(ErrorMarker);
        };

        let dataCallback = (data: any) => {
            try {
                let messageWithArgs: MessageWithArguments = JSON.parse(data);
                this.handleExtensionMessage(messageWithArgs)
                    .then(result => {
                        socket.end(JSON.stringify(result));
                    })
                    .catch((e) => { handleError(e); })
                    .done();
            } catch (e) {
                handleError(e);
            }
        };

        socket.on("data", dataCallback);
    };

    /**
     * Recovers the server in case the named socket we use already exists, but no other instance of VSCode is active.
     */
    private recoverServer(error: any): void {
        let errorHandler = (e: any) => {
            /* The named socket is not used. */
            if (e.code === "ECONNREFUSED") {
                CordovaProjectHelper.deleteDirectoryRecursive(this.pipePath);
                this.serverInstance.listen(this.pipePath);
            }
        };

        /* The named socket already exists. */
        if (error.code === "EADDRINUSE") {
            let clientSocket = new net.Socket();
            clientSocket.on("error", errorHandler);
            clientSocket.connect(this.pipePath, function () {
                clientSocket.end();
            });
        }
    }
}
