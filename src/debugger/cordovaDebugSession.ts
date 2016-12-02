// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {CordovaDebugAdapter} from './cordovaDebugAdapter';
import {CordovaPathTransformer} from './cordovaPathTransformer';
import {logger,
    ChromeConnection,
    IChromeDebugSessionOpts,
    AdapterProxy,
    LineNumberTransformer,
    SourceMapTransformer,
    chromeTargetDiscoveryStrategy
} from 'vscode-chrome-debug-core';
import {DebugSession, ErrorDestination, OutputEvent, Response} from 'vscode-debugadapter';
import {DebugProtocol} from 'vscode-debugprotocol';

import * as Q from 'q';

export class CordovaDebugSession extends DebugSession {
    private _adapterProxy: AdapterProxy;

    protected launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments): Q.Promise<any> {
        logger.log(`Cordova launchRequest: ${response}(${JSON.stringify(args)})`);
        return Q.resolve({});
    }

    protected attachRequest(response: DebugProtocol.AttachResponse, args: DebugProtocol.AttachRequestArguments): Q.Promise<any> {
        logger.log(`Cordova attachRequest: ${response}(${JSON.stringify(args)})`);
        return Q.resolve({});
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): Q.Promise<any> {
        logger.log(`Cordova initializeRequest: ${response}(${JSON.stringify(args)})`);
        return Q.resolve({});
    }

    public constructor(targetLinesStartAt1: boolean, isServer: boolean = false, opts: IChromeDebugSessionOpts = {}) {
        super(targetLinesStartAt1, isServer);

        let outputLogger = (message: string, error?: boolean | string) => {
            var category = "console";
            if (error === true) {
                category = "stderr";
            }

            if (typeof error === 'string') {
                category = error;
            }

            this.sendEvent(new OutputEvent(message + '\n', category));
        }

        let cdvPathTransformer = new CordovaPathTransformer(outputLogger);
        const connection = new ChromeConnection(chromeTargetDiscoveryStrategy.getChromeTargetWebSocketURL, opts.targetFilter);
        const adapter = opts.adapter || new CordovaDebugAdapter(outputLogger, cdvPathTransformer, connection);

        this._adapterProxy = new AdapterProxy(
            [
                new LineNumberTransformer(targetLinesStartAt1),
                new SourceMapTransformer(),
                cdvPathTransformer
            ],
            adapter,
            event => this.sendEvent(event));
    }

    /**
     * Takes a response and a promise to the response body. If the promise is successful, assigns the response body and sends the response.
     * If the promise fails, sets the appropriate response parameters and sends the response.
     */
    private sendResponseAsync(request: DebugProtocol.Request, response: DebugProtocol.Response, responseP: Promise<any>): void {
        responseP.then(
            (body?) => {
                response.body = body;
                this.sendResponse(response);
            },
            e => {
                const eStr = e ? e.toString() : 'Unknown error';
                if (eStr === 'unknowncommand') {
                    this.sendErrorResponse(response, 1014, 'Unrecognized request', null, ErrorDestination.Telemetry);
                    return;
                }

                if (request.command === 'evaluate') {
                    // Errors from evaluate show up in the console or watches pane. Doesn't seem right
                    // as it's not really a failed request. So it doesn't need the tag and worth special casing.
                    response.message = e.toString();
                } else {
                    // These errors show up in the message bar at the top (or nowhere), sometimes not obvious that they
                    // come from the adapter
                    response.message = '[cordova-debug-adapter] ' + e.toString();
                    logger.log('Error: ' + e.toString());
                }

                response.success = false;
                this.sendResponse(response);
            });
    }

    /**
     * Overload dispatchRequest to dispatch to the adapter proxy instead of debugSession's methods for each request.
     */
    protected dispatchRequest(request: DebugProtocol.Request): void {
        const response = new Response(request);
        try {
            let cordovaCommandResult = Q({});
            if (request.command === 'initialize') {
                let args = <DebugProtocol.InitializeRequestArguments> request.arguments;
                cordovaCommandResult = this.initializeRequest(<DebugProtocol.InitializeResponse> response, args);

            } else if (request.command === 'launch') {
                cordovaCommandResult = this.launchRequest(<DebugProtocol.LaunchResponse> response, request.arguments);

            } else if (request.command === 'attach') {
                cordovaCommandResult = this.attachRequest(<DebugProtocol.AttachResponse> response, request.arguments);
            }
            cordovaCommandResult.done(() => {
                logger.log(`From client: ${request.command}(${JSON.stringify(request.arguments) })`);
                this.sendResponseAsync(
                    request,
                    response,
                    this._adapterProxy.dispatchRequest(request));
                });
        } catch (e) {
            this.sendErrorResponse(response, 1104, 'Exception while processing request (exception: {_exception})', { _exception: e.message }, ErrorDestination.Telemetry);
        }
    }
}
