/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {Response} from '../../debugger/common/v8Protocol';
import {DebugSession, ErrorDestination, OutputEvent} from '../../debugger/common/debugSession';
import {CordovaDebugAdapter} from './cordovaDebugAdapter';
import {CordovaPathTransformer} from './cordovaPathTransformer';
import {Logger} from '../../debugger/webkit/utilities';

import {AdapterProxy} from '../../debugger/adapter/adapterProxy';
import {LineNumberTransformer} from '../../debugger/adapter/lineNumberTransformer';

import {SourceMapTransformer} from '../../debugger/adapter/sourceMaps/sourceMapTransformer';
import * as Q from 'q';

export class CordovaDebugSession extends DebugSession {
    private _adapterProxy: AdapterProxy;

    protected launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments): Q.Promise<any> {
        Logger.log(`Cordova launchRequest: ${response}(${JSON.stringify(args)})`);
        return Q.resolve({});
    }

    protected attachRequest(response: DebugProtocol.AttachResponse, args: DebugProtocol.AttachRequestArguments): Q.Promise<any> {
        Logger.log(`Cordova attachRequest: ${response}(${JSON.stringify(args)})`);
        return Q.resolve({});
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): Q.Promise<any> {
        Logger.log(`Cordova initializeRequest: ${response}(${JSON.stringify(args)})`);
        return Q.resolve({});
    }

    public constructor(targetLinesStartAt1: boolean, isServer: boolean = false) {
        super(targetLinesStartAt1, isServer);

        let outputLogger = (message: string, error: boolean = false) => this.sendEvent(new OutputEvent(message + '\n', error ? 'stderr' : 'console'));

        this._adapterProxy = new AdapterProxy(
            [
                new LineNumberTransformer(targetLinesStartAt1),
                new SourceMapTransformer(),
                new CordovaPathTransformer(outputLogger)
            ],
            new CordovaDebugAdapter(outputLogger),
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
                    Logger.log('Error: ' + e.toString());
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
                Logger.log(`From client: ${request.command}(${JSON.stringify(request.arguments) })`);
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
