// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as Net from "net";
import { v4 as uuidv4 } from "uuid";
import { CordovaDebugSession } from "../debugger/cordovaDebugSession";

export class CordovaSessionManager implements vscode.DebugAdapterDescriptorFactory {

    private servers = new Map<string, Net.Server>();
    private connections = new Map<string, Net.Socket>();

    public createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        const cordovaDebugSessionId = uuidv4();

        const debugServer = Net.createServer(socket => {
            let cordovaDebugSession = new CordovaDebugSession(session, cordovaDebugSessionId, this);
            cordovaDebugSession.setRunAsServer(true);
            this.connections.set(cordovaDebugSessionId, socket);
            cordovaDebugSession.start(<NodeJS.ReadableStream>socket, socket);
        });
        debugServer.listen(0);
        this.servers.set(cordovaDebugSessionId, debugServer);
        // make VS Code connect to debug server
        return new vscode.DebugAdapterServer((<Net.AddressInfo>debugServer.address()).port);
    }

    public terminate(cordovaDebugSessionId: string, forcedStop: boolean = false): void {
        this.destroyServer(cordovaDebugSessionId, this.servers.get(cordovaDebugSessionId));

        let connection = this.connections.get(cordovaDebugSessionId);
        if (connection) {
            if (forcedStop) {
                this.destroySocketConnection(connection);
            }
            this.connections.delete(cordovaDebugSessionId);
        }
    }

    public dispose(): void {
        this.servers.forEach((server, key) => {
            this.destroyServer(key, server);
        });
        this.connections.forEach((conn, key) => {
            this.destroySocketConnection(conn);
            this.connections.delete(key);
        });
    }

    private destroyServer(cordovaDebugSessionId: string, server?: Net.Server) {
        if (server) {
            server.close();
            this.servers.delete(cordovaDebugSessionId);
        }
    }

    private destroySocketConnection(conn: Net.Socket) {
        conn.removeAllListeners();
        conn.on("error", () => undefined);
        conn.destroy();
    }
}
