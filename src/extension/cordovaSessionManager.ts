// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as Net from "net";
import * as vscode from "vscode";
import CordovaDebugSession from "../debugger/cordovaDebugSession";
import { CordovaSession, CordovaSessionStatus } from "../debugger/debugSessionWrapper";

export class CordovaSessionManager implements vscode.DebugAdapterDescriptorFactory {
    protected readonly cordovaDebuggingFlag = "isCordovaDebugging";

    private servers = new Map<string, Net.Server>();
    private connections = new Map<string, Net.Socket>();
    private cordovaDebugSessions = new Map<string, CordovaSession>();
    private restartingVSCodeSessions = new Set<string>();

    public createDebugAdapterDescriptor(
        session: vscode.DebugSession,
        executable: vscode.DebugAdapterExecutable | undefined,
    ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        const cordovaSession = this.createCordovaSession(session);
        this.cordovaDebugSessions.set(cordovaSession.getSessionId(), cordovaSession);

        vscode.commands.executeCommand("setContext", this.cordovaDebuggingFlag, true);

        const debugServer = Net.createServer(socket => {
            const cordovaDebugSession = new CordovaDebugSession(cordovaSession, this);
            cordovaDebugSession.setRunAsServer(true);
            this.connections.set(cordovaSession.getSessionId(), socket);
            cordovaDebugSession.start(<NodeJS.ReadableStream>socket, socket);
        });
        debugServer.listen(0);
        this.servers.set(cordovaSession.getSessionId(), debugServer);
        // make VS Code connect to debug server
        return new vscode.DebugAdapterServer((<Net.AddressInfo>debugServer.address()).port);
    }

    public terminate(
        cordovaDebugSessionId: string,
        restart: boolean = false,
        forcedStop: boolean = false,
    ): void {
        if (restart && this.cordovaDebugSessions.has(cordovaDebugSessionId)) {
            this.restartingVSCodeSessions.add(
                this.cordovaDebugSessions.get(cordovaDebugSessionId).getVSCodeDebugSession().id,
            );
        }
        this.cordovaDebugSessions.delete(cordovaDebugSessionId);
        if (this.cordovaDebugSessions.size === 0) {
            vscode.commands.executeCommand("setContext", this.cordovaDebuggingFlag, false);
        }

        this.destroyServer(cordovaDebugSessionId, this.servers.get(cordovaDebugSessionId));

        const connection = this.connections.get(cordovaDebugSessionId);
        if (connection) {
            if (forcedStop) {
                this.destroySocketConnection(connection);
            }
            this.connections.delete(cordovaDebugSessionId);
        }
    }

    public getCordovaDebugSessionByProjectRoot(projectRoot: string): CordovaSession | null {
        for (const cordovaSession of this.cordovaDebugSessions.values()) {
            if (cordovaSession.getVSCodeDebugSession().workspaceFolder.uri.fsPath === projectRoot) {
                return cordovaSession;
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

    private createCordovaSession(session: vscode.DebugSession): CordovaSession {
        const cordovaSession = new CordovaSession(session);
        if (this.restartingVSCodeSessions.has(session.id)) {
            cordovaSession.setStatus(CordovaSessionStatus.Pending);
            this.restartingVSCodeSessions.delete(session.id);
        }
        return cordovaSession;
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
