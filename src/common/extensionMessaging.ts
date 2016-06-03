// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {Hash} from "../utils/hash"
import * as Q from "q";
import * as net from "net";

export let ErrorMarker = "vscode-cordova-error-marker";

/**
 * Defines the messages sent to the extension.
 * Add new messages to this enum.
 */
export enum ExtensionMessage {
    GET_VISIBLE_EDITORS_COUNT,
    LAUNCH_SIM_HOST,
    SEND_TELEMETRY,
    SIMULATE,
    START_SIMULATE_SERVER
}

export interface MessageWithArguments {
    message: ExtensionMessage;
    args: any[];
}

/**
 * Sends messages to the extension.
 */
export class ExtensionMessageSender {
    private hash: string;

    constructor(projectRoot: string) {
        this.hash = Hash.hashCode(projectRoot);
    }

    public getExtensionPipePath(): string {
        switch (process.platform) {
            case "win32":
                return `\\\\?\\pipe\\vscodecordova-${this.hash}`;
            default:
                return `/tmp/vscodecordova-${this.hash}.sock`;
        }
    }

    public sendMessage(message: ExtensionMessage, args?: any[]): Q.Promise<any> {
        let deferred = Q.defer<any>();
        let messageWithArguments: MessageWithArguments = { message: message, args: args };
        let body = "";

        let pipePath = this.getExtensionPipePath();
        let socket = net.connect(pipePath, function () {
            let messageJson = JSON.stringify(messageWithArguments);
            socket.write(messageJson);
        });

        socket.on("data", function (data: any) {
            body += data;
        });

        socket.on("error", function (data: any) {
            deferred.reject(new Error("An error occurred while handling message: " + ExtensionMessage[message]));
        });

        socket.on("end", function () {
            try {
                if (body.startsWith(ErrorMarker)) {
                    let errorString = body.replace(ErrorMarker, "");
                    let error = new Error(errorString ? errorString : "An error occurred while handling message: " + ExtensionMessage[message]);
                    deferred.reject(error);
                } else {
                    let responseBody: any = body ? JSON.parse(body) : null;
                    deferred.resolve(responseBody);
                }
            } catch (e) {
                deferred.reject(e);
            }
        });

        return deferred.promise;
    }
}
