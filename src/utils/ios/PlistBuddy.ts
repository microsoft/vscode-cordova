// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { ChildProcess } from "../../common/node/childProcess";

export class PlistBuddy {
    private static readonly plistBuddyExecutable = "/usr/libexec/PlistBuddy";

    private childProcess: ChildProcess = new ChildProcess();

    public readPlistProperty(plistFile: string, property: string): Promise<string> {
        return this.invokePlistBuddy(`Print ${property}`, plistFile);
    }

    private async invokePlistBuddy(command: string, plistFile: string): Promise<string> {
        const res = await this.childProcess.exec(
            `${PlistBuddy.plistBuddyExecutable} -c '${command}' '${plistFile}'`,
        );
        const outcome = await res.outcome;
        return outcome.toString().trim();
    }
}
