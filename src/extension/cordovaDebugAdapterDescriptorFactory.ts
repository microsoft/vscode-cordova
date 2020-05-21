// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as Net from "net";
import { CordovaDebugSession } from "../debugger/cordovaDebugSession";

export class CordovaDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

    private server?: Net.Server;
    private vscodeDebugSession: vscode.DebugSession;

    public createDebugAdapterDescriptor(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        this.vscodeDebugSession = session;

        if (!this.server) {
            // start listening on a random port
            this.server = Net.createServer(socket => {
                const cordovaDebugSession = new CordovaDebugSession(this.vscodeDebugSession);
                cordovaDebugSession.setRunAsServer(true);
                cordovaDebugSession.start(<NodeJS.ReadableStream>socket, socket);
            }).listen(0);
        }

        // make VS Code connect to debug server
        return new vscode.DebugAdapterServer((<Net.AddressInfo>this.server.address()).port);
    }

    public dispose() {
        if (this.server) {
            this.server.close();
        }
    }
}
