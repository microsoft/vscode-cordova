// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as Net from "net";
import { v4 as uuidv4 } from "uuid";
import { CordovaDebugSession } from "../debugger/cordovaDebugSession";

export class CordovaSessionManager implements vscode.DebugAdapterDescriptorFactory {

    protected readonly cordovaDebuggingFlag = "isCordovaDebugging";

    private servers = new Map<string, Net.Server>();
    private connections = new Map<string, Net.Socket>();
    private cordovaDebugSessions = new Map<string, vscode.DebugSession>();

    public createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        const cordovaDebugSessionId = uuidv4();
        this.cordovaDebugSessions.set(cordovaDebugSessionId, session);
        vscode.commands.executeCommand("setContext", this.cordovaDebuggingFlag, true);

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
        this.cordovaDebugSessions.delete(cordovaDebugSessionId);
        if (this.cordovaDebugSessions.size === 0) {
            vscode.commands.executeCommand("setContext", this.cordovaDebuggingFlag, false);
        }

        this.destroyServer(cordovaDebugSessionId, this.servers.get(cordovaDebugSessionId));

        let connection = this.connections.get(cordovaDebugSessionId);
        if (connection) {
            if (forcedStop) {
                this.destroySocketConnection(connection);
            }
            this.connections.delete(cordovaDebugSessionId);
        }
    }

    public getCordovaDebugSessionByProjectRoot(projectRoot: string): vscode.DebugSession | null {
        for (let session of this.cordovaDebugSessions.values()) {
            if (session.workspaceFolder.uri.fsPath === projectRoot) {
                return session;
            }
        }

        return null;
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
