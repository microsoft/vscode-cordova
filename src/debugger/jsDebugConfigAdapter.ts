// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { ICordovaAttachRequestArgs } from "./requestArgs";
import { logger } from "vscode-debugadapter";
import { CordovaProjectHelper } from "../utils/cordovaProjectHelper";
import * as nls from "vscode-nls";
nls.config({ messageFormat: nls.MessageFormat.bundle, bundleFormat: nls.BundleFormat.standalone })();
const localize = nls.loadMessageBundle();

export interface IStringDictionary<T> {
    [name: string]: T;
}
export type ISourceMapPathOverrides = IStringDictionary<string>;

export class JsDebugConfigAdapter {
    // Keep in sync with sourceMapPathOverrides package.json default values
    private readonly DefaultWebSourceMapPathOverrides: ISourceMapPathOverrides = {
        "webpack:///./~/*": "${cwd}/node_modules/*",
        "webpack:///./*": "${cwd}/*",
        "webpack:///*": "*",
        "webpack:///src/*": "${cwd}/*",
        "./*": "${cwd}/*",
    };

    public createChromeDebuggingConfig(attachArgs: ICordovaAttachRequestArgs, cdpProxyPort: number, pwaSessionName: string, sessionId: string): any {
        let extraArgs: any = {};
        if (!CordovaProjectHelper.isIonicAngularProject(attachArgs.cwd) && !attachArgs.simulatePort) {
            extraArgs.pathMapping = {
                "/android_asset/www": `${attachArgs.cwd}/www`,
            };
            extraArgs.url = "file:///";
            extraArgs.urlFilter = "*";
        }

        return Object.assign({}, this.getExistingExtraArgs(attachArgs), extraArgs, {
            type: pwaSessionName,
            request: "attach",
            name: "Attach",
            port: cdpProxyPort,
            webRoot: `${attachArgs.cwd}/www`,
            // The unique identifier of the debug session. It is used to distinguish Cordova extension's
            // debug sessions from other ones. So we can save and process only the extension's debug sessions
            // in vscode.debug API methods "onDidStartDebugSession" and "onDidTerminateDebugSession".
            cordovaDebugSessionId: sessionId,
        });
    }

    public createSafariDebuggingConfig(attachArgs: ICordovaAttachRequestArgs, cdpProxyPort: number, pwaSessionName: string, sessionId: string): any {
        let extraArgs: any = {};
        if (attachArgs.ionicLiveReload) {
            extraArgs.resolveSourceMapLocations = [
                "**",
                "!**/node_modules/**",
            ];
        }

        return Object.assign({}, this.getExistingExtraArgs(attachArgs), extraArgs, {
            type: pwaSessionName,
            request: "attach",
            name: "Attach",
            port: cdpProxyPort,
            // The unique identifier of the debug session. It is used to distinguish Cordova extension's
            // debug sessions from other ones. So we can save and process only the extension's debug sessions
            // in vscode.debug API methods "onDidStartDebugSession" and "onDidTerminateDebugSession".
            cordovaDebugSessionId: sessionId,
        });
    }

    private getExistingExtraArgs(attachArgs: ICordovaAttachRequestArgs): any {
        let existingExtraArgs: any = {};
        if (attachArgs.env) {
            existingExtraArgs.env = attachArgs.env;
        }
        if (attachArgs.envFile) {
            existingExtraArgs.envFile = attachArgs.envFile;
        }
        if (typeof attachArgs.sourceMaps === "boolean") {
            existingExtraArgs.sourceMaps = attachArgs.sourceMaps;
        }
        existingExtraArgs.sourceMapPathOverrides = this.getSourceMapPathOverrides(
            attachArgs.cwd,
            attachArgs.sourceMapPathOverrides || this.DefaultWebSourceMapPathOverrides
        );
        if (attachArgs.skipFiles) {
            existingExtraArgs.skipFiles = attachArgs.skipFiles;
        }
        if (attachArgs.trace) {
            existingExtraArgs.trace = attachArgs.trace;
        }
        if (attachArgs.attachTimeout) {
            existingExtraArgs.timeout = attachArgs.attachTimeout;
        }

        return existingExtraArgs;
    }

    private getSourceMapPathOverrides(cwd: string, sourceMapPathOverrides?: ISourceMapPathOverrides): ISourceMapPathOverrides {
        return sourceMapPathOverrides ? this.resolveWebRootPattern(cwd, sourceMapPathOverrides, /*warnOnMissing=*/true) :
            this.resolveWebRootPattern(cwd, this.DefaultWebSourceMapPathOverrides, /*warnOnMissing=*/false);
    }
    /**
     * Returns a copy of sourceMapPathOverrides with the ${cwd} pattern resolved in all entries.
     */
    private resolveWebRootPattern(cwd: string, sourceMapPathOverrides: ISourceMapPathOverrides, warnOnMissing: boolean): ISourceMapPathOverrides {
        const resolvedOverrides: ISourceMapPathOverrides = {};
        // tslint:disable-next-line:forin
        for (let pattern in sourceMapPathOverrides) {
            const replacePattern = this.replaceWebRootInSourceMapPathOverridesEntry(cwd, pattern, warnOnMissing);
            const replacePatternValue = this.replaceWebRootInSourceMapPathOverridesEntry(cwd, sourceMapPathOverrides[pattern], warnOnMissing);
            resolvedOverrides[replacePattern] = replacePatternValue;
        }
        return resolvedOverrides;
    }

    private replaceWebRootInSourceMapPathOverridesEntry(cwd: string, entry: string, warnOnMissing: boolean): string {
        const cwdIndex = entry.indexOf("${cwd}");
        if (cwdIndex === 0) {
            if (cwd) {
                return entry.replace("${cwd}", cwd);
            } else if (warnOnMissing) {
                logger.warn(localize("SourceMapOverridesEntryContainsCwd", "Warning: sourceMapPathOverrides entry contains ${cwd}, but cwd is not set"));
            }
        } else if (cwdIndex > 0) {
            logger.warn(localize("InASourceMapOverridesEntryCwdValidAtTheBeginning", "Warning: in a sourceMapPathOverrides entry, ${cwd} is only valid at the beginning of the path"));
        }
        return entry;
    }
}
