// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as assert from "assert";
import * as vscode from "vscode";
import { Connection, Server, WebSocketTransport } from "vscode-cdp-proxy";
import { convertWindowsPathToUnixOne } from "../testUtils";
import { generateRandomPortNumber, delay } from "../../src/utils/extensionHelper";
import { CordovaCDPProxy } from "../../src/debugger/cdp-proxy/cordovaCDPProxy";
import { ProjectType } from "../../src/utils/cordovaProjectHelper";
import { ICordovaAttachRequestArgs } from "../../src/debugger/requestArgs";
import { CDPMessageHandlerCreator } from "../../src/debugger/cdp-proxy/CDPMessageHandlers/CDPMessageHandlerCreator";
import { CDPMessageHandlerBase } from "../../src/debugger/cdp-proxy/CDPMessageHandlers/abstraction/CDPMessageHandlerBase";
import { CDP_API_NAMES } from "../../src/debugger/cdp-proxy/CDPMessageHandlers/CDPAPINames";
import { SourcemapPathTransformer } from "../../src/debugger/cdp-proxy/sourcemapPathTransformer";
import { LogLevel } from "../../src/utils/log/logHelper";
import { DebuggerEndpointHelper } from "../../src/debugger/cdp-proxy/debuggerEndpointHelper";
import { PlatformType } from "../../src/debugger/cordovaDebugSession";

interface ICdpProxyInternalEntities {
    attachArgs: ICordovaAttachRequestArgs;
    projectType: ProjectType;
    sourcemapPathTransformer: SourcemapPathTransformer;
    cdpMessageHandler: CDPMessageHandlerBase;
}

suite("cordovaCDPProxy", function () {
    const cdpProxyHostAddress = "127.0.0.1"; // localhost
    const cdpProxyPort = generateRandomPortNumber();
    const cdpProxyLogLevel = LogLevel.Custom;
    const testProjectPath =
        process.platform === "win32"
            ? convertWindowsPathToUnixOne(
                  path.join(__dirname, "..", "resources", "testCordovaProject"),
              )
            : path.join(__dirname, "..", "resources", "testCordovaProject");

    let proxy: CordovaCDPProxy;
    const cancellationTokenSource: vscode.CancellationTokenSource =
        new vscode.CancellationTokenSource();

    const wsTargetPort = generateRandomPortNumber();
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
            wsTargetServer.dispose();
            wsTargetServer = null;
        }
    }

    function prepareCDPProxyInternalEntities(
        debugType: "ionic" | "cordova" | "simulate",
        cdpHandlerType: "chrome" | "safari",
    ): ICdpProxyInternalEntities {
        let sourcemapPathTransformer: SourcemapPathTransformer;
        let cdpMessageHandler: CDPMessageHandlerBase;

        const projectType: ProjectType = new ProjectType(
            false, // isMeteor
            false, // isMobileFirst
            false, // isPhonegap
            true, // isCordova
        );

        const attachArgs: ICordovaAttachRequestArgs = {
            cwd: path.resolve(__dirname, "..", "resources", "testCordovaProject"),
            platform: PlatformType.Android,
            ionicLiveReload: false,
            request: "attach",
            port: 9222,
        };

        switch (debugType) {
            case "ionic":
                projectType.ionicMajorVersion = 5;
                break;
            case "cordova":
                break;
            case "simulate":
                attachArgs.simulatePort = 8000;
                break;
        }

        if (cdpHandlerType === "chrome") {
            sourcemapPathTransformer = new SourcemapPathTransformer(
                attachArgs.cwd,
                attachArgs.platform,
                projectType,
                attachArgs.request,
                attachArgs.ionicLiveReload,
                attachArgs.address,
            );
            cdpMessageHandler = CDPMessageHandlerCreator.create(
                sourcemapPathTransformer,
                projectType,
                attachArgs,
                true,
            );
        } else {
            attachArgs.platform = PlatformType.IOS;

            sourcemapPathTransformer = new SourcemapPathTransformer(
                attachArgs.cwd,
                attachArgs.platform,
                projectType,
                attachArgs.request,
                attachArgs.ionicLiveReload,
                attachArgs.address,
            );
            cdpMessageHandler = CDPMessageHandlerCreator.create(
                sourcemapPathTransformer,
                projectType,
                attachArgs,
                false,
            );
        }

        return {
            attachArgs,
            projectType,
            sourcemapPathTransformer,
            cdpMessageHandler,
        };
    }

    suiteSetup(async () => {
        const cdpProxyInternalEntities = prepareCDPProxyInternalEntities("cordova", "chrome");
        proxy = new CordovaCDPProxy(
            cdpProxyHostAddress,
            cdpProxyPort,
            cdpProxyInternalEntities.sourcemapPathTransformer,
            cdpProxyInternalEntities.projectType,
            cdpProxyInternalEntities.attachArgs,
        );

        proxy.setApplicationTargetPort(wsTargetPort);
        await proxy.createServer(cdpProxyLogLevel, cancellationTokenSource.token);

        await Server.create({ host: "localhost", port: wsTargetPort }).then((server: Server) => {
            wsTargetServer = server;

            server.onConnection(([connection, request]: [Connection, any]) => {
                targetConnection = connection;
            });
        });

        const proxyUri = await new DebuggerEndpointHelper().getWSEndpoint(
            `http://${cdpProxyHostAddress}:${cdpProxyPort}`,
        );
        debugConnection = new Connection(await WebSocketTransport.create(proxyUri));

        // Due to the time limit, sooner or later this cycle will end
        while (!targetConnection) {
            // eslint-disable-next-line no-await-in-loop
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
                    const cdpProxyInternalEntities = prepareCDPProxyInternalEntities(
                        "cordova",
                        "chrome",
                    );
                    Object.assign(proxy, {
                        CDPMessageHandler: cdpProxyInternalEntities.cdpMessageHandler,
                    });
                });

                test("Messages should be delivered correctly with ChromeCDPMessageHandler", async () => {
                    const targetMessageStart = {
                        method: "Target.start",
                        params: { reason: "test" },
                    };
                    const debuggerMessageStart = {
                        method: "Debugger.start",
                        params: { reason: "test" },
                    };

                    const messageFromTarget = await new Promise(resolve => {
                        targetConnection?.send(targetMessageStart);

                        debugConnection?.onCommand((evt: any) => {
                            resolve(evt);
                        });
                    });

                    const messageFromDebugger = await new Promise(resolve => {
                        debugConnection?.send(debuggerMessageStart);

                        targetConnection?.onCommand((evt: any) => {
                            resolve(evt);
                        });
                    });

                    assert.deepStrictEqual(messageFromTarget, targetMessageStart);
                    assert.deepStrictEqual(messageFromDebugger, debuggerMessageStart);
                });

                suite("Simulate", () => {
                    suiteSetup(() => {
                        const cdpProxyInternalEntities = prepareCDPProxyInternalEntities(
                            "simulate",
                            "chrome",
                        );
                        Object.assign(proxy, {
                            CDPMessageHandler: cdpProxyInternalEntities.cdpMessageHandler,
                        });
                    });

                    test(`Message from the target with ${CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED} should replace the "url" prop with the correct absolute path for the source`, async () => {
                        const processedMessageRef = {
                            method: CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED,
                            params: {
                                url: `file://${
                                    process.platform === "win32"
                                        ? `/${testProjectPath}`
                                        : testProjectPath
                                }/www/js/index.js`,
                            },
                        };

                        const targetMessageTest = {
                            method: CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED,
                            params: {
                                url: "http://localhost:8000/js/index.js",
                            },
                        };

                        const processedMessage = await new Promise(resolve => {
                            targetConnection?.send(targetMessageTest);

                            debugConnection?.onCommand((evt: any) => {
                                resolve(evt);
                            });
                        });

                        assert.deepStrictEqual(processedMessageRef, processedMessage);
                    });
                });
            });

            suite("Ionic", () => {
                suiteSetup(() => {
                    const cdpProxyInternalEntities = prepareCDPProxyInternalEntities(
                        "ionic",
                        "chrome",
                    );
                    Object.assign(proxy, {
                        CDPMessageHandler: cdpProxyInternalEntities.cdpMessageHandler,
                    });
                });

                test(`Message from the target with ${CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED} should replace the "url" prop with the correct absolute path for the source`, async () => {
                    const processedMessageRef = {
                        method: CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED,
                        params: {
                            url: `file://${
                                process.platform === "win32"
                                    ? `/${testProjectPath}`
                                    : testProjectPath
                            }/www/main.js`,
                        },
                    };

                    const targetMessageTest = {
                        method: CDP_API_NAMES.DEBUGGER_SCRIPT_PARSED,
                        params: {
                            url: "http://localhost/main.js",
                        },
                    };

                    const processedMessage = await new Promise(resolve => {
                        targetConnection?.send(targetMessageTest);

                        debugConnection?.onCommand((evt: any) => {
                            resolve(evt);
                        });
                    });

                    assert.deepStrictEqual(processedMessageRef, processedMessage);
                });

                test(`Message from the debugger with ${CDP_API_NAMES.DEBUGGER_SET_BREAKPOINT_BY_URL} should replace the "urlRegex" prop with the correct one`, async () => {
                    const processedMessageRef = {
                        method: CDP_API_NAMES.DEBUGGER_SET_BREAKPOINT_BY_URL,
                        params: {
                            urlRegex: `http:\\/\\/localhost\\/${
                                process.platform === "win32"
                                    ? "[mM][aA][iI][nN]\\.[jJ][sS]"
                                    : "main\\.js"
                            }`,
                        },
                    };

                    let testUrlRegex;
                    if (process.platform === "win32") {
                        const testPathRegex = `${testProjectPath.replace(
                            /([./])/g,
                            "\\$1",
                        )}\\\\[wW][wW][wW]\\\\[mM][aA][iI][nN]\\.[jJ][sS]`;
                        testUrlRegex = `[fF][iI][lL][eE]:\\/\\/${testPathRegex}|${testPathRegex}`;
                    } else {
                        const testPathRegex = `${testProjectPath}/www/main.js`.replace(
                            /([./])/g,
                            "\\$1",
                        );
                        testUrlRegex = `file:\\/\\/${testPathRegex}|${testPathRegex}`;
                    }

                    const debuggerMessageTest = {
                        method: CDP_API_NAMES.DEBUGGER_SET_BREAKPOINT_BY_URL,
                        params: {
                            urlRegex: testUrlRegex,
                        },
                    };

                    const processedMessage = await new Promise(resolve => {
                        debugConnection?.send(debuggerMessageTest);

                        targetConnection?.onCommand((evt: any) => {
                            resolve(evt);
                        });
                    });

                    assert.deepStrictEqual(processedMessageRef, processedMessage);
                });
            });
        });
        suite("SafariCDPMessageHandler", () => {
            suite("Ionic", () => {
                const targetPageId = "page-7";
                suiteSetup(() => {
                    const cdpProxyInternalEntities = prepareCDPProxyInternalEntities(
                        "ionic",
                        "safari",
                    );
                    (cdpProxyInternalEntities.cdpMessageHandler as any).targetId = targetPageId;
                    Object.assign(proxy, {
                        CDPMessageHandler: cdpProxyInternalEntities.cdpMessageHandler,
                    });
                });

                test("Messages should be wrapped in the Target form", async () => {
                    const debuggerMessageTest = {
                        id: 1002,
                        method: "Debugger.enable",
                        params: {},
                    };

                    const processedMessageRef = {
                        id: debuggerMessageTest.id,
                        method: CDP_API_NAMES.TARGET_SEND_MESSAGE_TO_TARGET,
                        params: {
                            id: debuggerMessageTest.id,
                            message: JSON.stringify(debuggerMessageTest),
                            targetId: targetPageId,
                        },
                    };

                    const processedMessage = await new Promise(resolve => {
                        debugConnection?.send(debuggerMessageTest);

                        targetConnection?.onReply((evt: any) => {
                            resolve(evt);
                        });
                    });

                    assert.deepStrictEqual(processedMessageRef, processedMessage);
                });
            });
        });
    });
});
