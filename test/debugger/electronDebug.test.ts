// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { JsDebugConfigAdapter } from "../../src/debugger/jsDebugConfigAdapter";
import * as sinon from "sinon";
import { ICordovaAttachRequestArgs } from "../../src/debugger/requestArgs";
import { PlatformType } from "../../src/debugger/cordovaDebugSession";

suite("JsDebugConfigAdapter", function () {
    let jsDebugConfigAdapter: JsDebugConfigAdapter;

    suiteSetup(() => {
        jsDebugConfigAdapter = new JsDebugConfigAdapter();
    });

    suiteTeardown(() => {
        sinon.restore();
    });

    test("should create Electron debugging configuration", () => {
        const attachArgs: ICordovaAttachRequestArgs = {
            cwd: "test-cwd",
            port: 9222,
            request: "attach",
            platform: PlatformType.Browser,
            target: "electron",
            electronPort: 9223,
        };
        const cdpProxyPort = 9223;
        const pwaSessionName = "Electron Debug Session";
        const sessionId = "test-session-id";

        const config = jsDebugConfigAdapter.createElectronDebuggingConfig(
            attachArgs,
            cdpProxyPort,
            pwaSessionName,
            sessionId,
        );

        should.exist(config);
        config.should.be.not.empty;
        should(config[0]).containDeep({
            name: "Electron Main Process",
            type: "node",
            request: "launch",
            runtimeExecutable: `${attachArgs.cwd}/node_modules/.bin/electron`,
            sourceMapPathOverrides: {
                "/www/**": `${attachArgs.cwd}/platforms/electron/www/*`,
            },
        });
        should(config[1]).containDeep({
            name: pwaSessionName,
            type: "chrome",
            request: "attach",
            port: attachArgs.electronPort,
            webRoot: `${attachArgs.cwd}/platforms/electron/www/`,
        });
    });
});
