// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import { LogLevel, getFormattedDatetimeString } from "./logHelper";

const channels: { [channelName: string]: OutputChannelLogger } = {};

export class OutputChannelLogger {
    public static MAIN_CHANNEL_NAME: string = "Cordova Tools";
    private outputChannel: vscode.OutputChannel;
    private logTimestamps: boolean;

    constructor(
        public readonly channelName: string,
        lazy: boolean = false,
        private preserveFocus: boolean = false,
        logTimestamps: boolean = false,
    ) {
        this.logTimestamps = logTimestamps;
        if (!lazy) {
            this.channel = vscode.window.createOutputChannel(this.channelName);
            this.channel.show(this.preserveFocus);
        }
    }

    public static disposeChannel(channelName: string): void {
        if (channels[channelName]) {
            channels[channelName].getOutputChannel().dispose();
            delete channels[channelName];
        }
    }

    public static getMainChannel(): OutputChannelLogger {
        return this.getChannel(this.MAIN_CHANNEL_NAME, true);
    }

    public static getChannel(
        channelName: string,
        lazy?: boolean,
        preserveFocus?: boolean,
        logTimestamps?: boolean,
    ): OutputChannelLogger {
        if (!channels[channelName]) {
            channels[channelName] = new OutputChannelLogger(
                channelName,
                lazy,
                preserveFocus,
                logTimestamps,
            );
        }

        return channels[channelName];
    }

    private static purify(message: string): string {
        return message
            .toString()
            .replace(/\u001b/g, "")
            .replace(/\[2K\[G/g, "") // Erasing `[2K[G` artifacts from output
            .replace(/\[\d+m/g, ""); // Erasing "colors" from output
    }

    public log(message: string): void {
        this.channel.appendLine(OutputChannelLogger.purify(message));
    }

    public logWithCustomTag(tag: string, message: string, level: LogLevel): void {
        if (level === LogLevel.Custom) {
            message = this.getFormattedMessage(message, tag, this.logTimestamps);
            this.channel.appendLine(message);
        }
    }

    public append(message: string): void {
        this.channel.append(OutputChannelLogger.purify(message));
    }

    public getOutputChannel(): vscode.OutputChannel {
        return this.channel;
    }

    public clear(): void {
        this.channel.clear();
    }

    private get channel(): vscode.OutputChannel {
        if (this.outputChannel) {
            return this.outputChannel;
        }
        this.outputChannel = vscode.window.createOutputChannel(this.channelName);
        this.outputChannel.show(this.preserveFocus);
        return this.outputChannel;
    }

    private set channel(channel: vscode.OutputChannel) {
        this.outputChannel = channel;
    }

    private getFormattedMessage(
        message: string,
        tag: string,
        prependTimestamp: boolean = false,
    ): string {
        let formattedMessage = `[${tag}] ${message}\n`;

        if (prependTimestamp) {
            formattedMessage = `[${getFormattedDatetimeString(new Date())}] ${formattedMessage}`;
        }

        return formattedMessage;
    }
}
