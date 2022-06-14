// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { DebugSession } from "vscode";
import { v4 as uuidv4 } from "uuid";

export enum CordovaSessionStatus {
    NotActivated,
    Pending,
    Activated,
}

export class CordovaSession {
    private sessionId: string;
    private vsCodeDebugSession: DebugSession;
    private status: CordovaSessionStatus;

    constructor(vsCodeDebugSession: DebugSession) {
        this.sessionId = uuidv4();
        this.vsCodeDebugSession = vsCodeDebugSession;
        this.status = CordovaSessionStatus.NotActivated;
    }

    public getSessionId(): string {
        return this.sessionId;
    }

    public getVSCodeDebugSession(): DebugSession {
        return this.vsCodeDebugSession;
    }

    public getStatus(): CordovaSessionStatus {
        return this.status;
    }

    public setStatus(sessionStatus: CordovaSessionStatus): void {
        this.status = sessionStatus;
    }
}
