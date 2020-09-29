// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as vscode from "vscode";
import * as assert from "assert";
import {
    Connection,
    Server,
    WebSocketTransport
} from "vscode-cdp-proxy";
import { generateRandomPortNumber, delay } from "../../src/utils/extensionHelper";
import { CordovaCDPProxy } from "../../src/debugger/cdp-proxy/cordovaCDPProxy";
import { IProjectType } from "../../src/utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../src/debugger/requestArgs";
import { ChromeCDPMessageHandler } from "../../src/debugger/cdp-proxy/CDPMessageHandlers/chromeCDPMessageHandler";
import { CDPMessageHandlerBase } from "../../src/debugger/cdp-proxy/CDPMessageHandlers/CDPMessageHandlerBase";
import { CDP_API_NAMES } from "../../src/debugger/cdp-proxy/CDPMessageHandlers/CDPAPINames";
// import { SafariCDPMessageHandler } from "../../src/debugger/cdp-proxy/CDPMessageHandlers/safariCDPMessageHandler";
import { SourcemapPathTransformer } from "../../src/debugger/cdp-proxy/sourcemapPathTransformer";
import { LogLevel } from "../../src/utils/log/logHelper";
import { DebuggerEndpointHelper } from "../../src/debugger/cdp-proxy/debuggerEndpointHelper";

interface ICDPProxyInternalEntities {
    attachArgs: ICordovaAttachRequestArgs;
    projectType: IProjectType;
    sourcemapPathTransformer: SourcemapPathTransformer;
    cdpMessageHandler: CDPMessageHandlerBase;
}

suite("reactNativeCDPProxy", function () {
    const cdpProxyHostAddress = "127.0.0.1"; // localhost
    const cdpProxyPort = generateRandomPortNumber();
    const cdpProxyLogLevel = LogLevel.Custom;
    const testProjectPath = path.resolve(__dirname, "..", "testProject");

    let proxy: CordovaCDPProxy;
    let cancellationTokenSource: vscode.CancellationTokenSource = new vscode.CancellationTokenSource();

    let wsTargetPort = generateRandomPortNumber();
    let wsTargetServer: Server | null;

    let targetConnection: Connection | null;
    let debugConnection: Connection | null;

    // For all hooks and tests set a time limit
    this.timeout(5000);

    async function cleanUp() {
        cancellationTokenSource.dispose();
        if (targetConnection) {
            await targetConnection.close();
            targetConnection = null;
        }
        if (debugConnection) {
            await debugConnection.close();
            debugConnection = null;
        }
        await proxy.stopServer();
        if (wsTargetServer) {
            await wsTargetServer.dispose();
            wsTargetServer = null;
        }
    }

    function prepareCDPProxyInternalEntities(debugType: "ionic" | "cordova" | "simulate", cdpHandlerType: "chrome" | "safari"): ICDPProxyInternalEntities {
        let attachArgs: ICordovaAttachRequestArgs;
        let projectType: IProjectType;
        let sourcemapPathTransformer: SourcemapPathTransformer;
        let cdpMessageHandler: CDPMessageHandlerBase;

        switch(debugType) {
            case "ionic":

            break;
            case "cordova":
                attachArgs = {
                    cwd: path.resolve(__dirname, "..", "testProject"),
                    platform: "android",
                    ionicLiveReload: false,
                    request: "attach",
                    port: 9222,
                };
                projectType = {
                    isMeteor: false,
                    isMobilefirst: false,
                    isPhonegap: false,
                    isCordova: true,
                    isIonic1: false,
                    isIonic2: false,
                    isIonic3: false,
                    isIonic4: false,
                    isIonic5: false,
                };
                break;
            case "simulate":
                attachArgs = {
                    cwd: path.resolve(__dirname, "..", "testProject"),
                    platform: "android",
                    ionicLiveReload: false,
                    request: "attach",
                    port: 9222,
                    simulatePort: 8000,
                };
                projectType = {
                    isMeteor: false,
                    isMobilefirst: false,
                    isPhonegap: false,
                    isCordova: true,
                    isIonic1: false,
                    isIonic2: false,
                    isIonic3: false,
                    isIonic4: false,
                    isIonic5: false,
                };
            break;
        }

        sourcemapPathTransformer = new SourcemapPathTransformer(attachArgs, projectType);
        if (cdpHandlerType === "chrome") {
            cdpMessageHandler = new ChromeCDPMessageHandler(sourcemapPathTransformer, projectType, attachArgs);
        } else {

        }

        return {
            attachArgs,
            projectType,
            sourcemapPathTransformer,
            cdpMessageHandler,
        };
    }

    suiteSetup(async () => {
        let cdpProxyInternalEntities = prepareCDPProxyInternalEntities("cordova", "chrome");
        proxy = new CordovaCDPProxy(
            cdpProxyHostAddress,
            cdpProxyPort,
            cdpProxyInternalEntities.sourcemapPathTransformer,
            cdpProxyInternalEntities.projectType,
            cdpProxyInternalEntities.attachArgs
        );

        proxy.setApplicationTargetPort(wsTargetPort);
        await proxy.createServer(cdpProxyLogLevel, cancellationTokenSource.token);

        await Server.create({ host: "localhost", port: wsTargetPort })
            .then((server: Server) => {
                wsTargetServer = server;

                server.onConnection(([connection, request]: [Connection, any]) => {
                    targetConnection = connection;
                });
            });

        const proxyUri = await new DebuggerEndpointHelper().getWSEndpoint(`http://${cdpProxyHostAddress}:${cdpProxyPort}`);
        debugConnection = new Connection(await WebSocketTransport.create(proxyUri));

        // Due to the time limit, sooner or later this cycle will end
        while (!targetConnection) {
            await delay(1000);
        }
    });

    suiteTeardown(async () => {
        await cleanUp();
    });

    suite("MessageHandlers", () => {
        suite("ChromeCDPMessageHandler", () => {
            suite("Pure Cordova", () => {
                suiteSetup(() => {
                    let cdpProxyInternalEntities = prepareCDPProxyInternalEntities("cordova", "chrome");
                    Object.assign(proxy, {CDPMessageHandler: cdpProxyInternalEntities.cdpMessageHandler});
                });

                test("Messages should be delivered correctly with ChromeCDPMessageHandler", async () => {
                    const targetMessageStart = {method: "Target.start", params: {reason: "test"}};
                    const debuggerMessageStart = {method: "Debugger.start", params: {reason: "test"}};

                    const messageFromTarget = await new Promise((resolve) => {
                        targetConnection?.send(targetMessageStart);

                        debugConnection?.onCommand((evt: any) => {
                            resolve(evt);
                        });
                    })
                    .then((evt) => {
                        return evt;
                    });

                    const messageFromDebugger = await new Promise((resolve) => {
                        debugConnection?.send(debuggerMessageStart);

                        targetConnection?.onCommand((evt: any) => {
                            resolve(evt);
                        });
                    })
                    .then((evt) => {
                        return evt;
                    });

                    assert.deepStrictEqual(messageFromTarget, targetMessageStart);
                    assert.deepStrictEqual(messageFromDebugger, debuggerMessageStart);
                });

                suite("Simulate", () => {
                    suiteSetup(() => {
                        let cdpProxyInternalEntities = prepareCDPProxyInternalEntities("simulate", "chrome");
                        Object.assign(proxy, {CDPMessageHandler: cdpProxyInternalEntities.cdpMessageHandler});
                    });

                    test(`Message from target with ${CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED} should replace the "url" prop with the correct absolute path for the source`, async () => {
                        const targetMessageRef = {
                            method: CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED,
                            params: {
                                url: `file://${testProjectPath}/www/js/index.js`,
                            },
                        };

                        const debuggerMessageTest = {
                            method: CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED,
                            params: {
                                url: "http://localhost:8000/js/index.js",
                            },
                        };

                        const processedMessage = await new Promise((resolve) => {
                            targetConnection?.send(debuggerMessageTest);

                            debugConnection?.onCommand((evt: any) => {
                                resolve(evt);
                            });
                        })
                        .then((evt) => {
                            return evt;
                        });

                        assert.deepStrictEqual(targetMessageRef, processedMessage);
                    });
                });
            });
        });
    });
});
