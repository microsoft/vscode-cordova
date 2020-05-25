// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as Net from "net";
import { CordovaDebugSession } from "../debugger/cordovaDebugSession";

export class CordovaSessionManager implements vscode.DebugAdapterDescriptorFactory {

    private servers = new Map<string, Net.Server>();
    private connections = new Map<string, Net.Socket>();

    public createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        const debugServer = Net.createServer(socket => {
            let cordovaDebugSession = new CordovaDebugSession(session, this);
            cordovaDebugSession.setRunAsServer(true);
            this.connections.set(session.id, socket);
            cordovaDebugSession.start(<NodeJS.ReadableStream>socket, socket);
        });
        debugServer.listen(0);
        this.servers.set(session.id, debugServer);
        // make VS Code connect to debug server
        return new vscode.DebugAdapterServer((<Net.AddressInfo>debugServer.address()).port);
    }

    public terminate(debugSession: vscode.DebugSession): void {
        this.destroyServer(this.servers.get(debugSession.id), debugSession.id);
        this.destroySocketConnection(this.connections.get(debugSession.id), debugSession.id);
    }

    public dispose(): void {
        this.servers.forEach((server, key) => {
            this.destroyServer(server, key);
        });
        this.connections.forEach((conn, key) => {
            this.destroySocketConnection(conn, key);
        });
    }

    private destroyServer(server: Net.Server, sessionId: string) {
        if (server) {
            server.close();
            this.servers.delete(sessionId);
        }
    }

    private destroySocketConnection(conn: Net.Socket, sessionId: string) {
        if (conn) {
            conn.removeAllListeners();
            conn.on("error", () => undefined);
            conn.destroy();
            this.connections.delete(sessionId);
        }
    }
}
