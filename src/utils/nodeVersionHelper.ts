// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as fs from "fs";
import * as path from "path";
import * as nls from "vscode-nls";
import { ErrorHelper } from "../common/error/errorHelper";
import { InternalErrorCode } from "../common/error/internalErrorCode";
import { ICordovaAttachRequestArgs, ICordovaLaunchRequestArgs } from "../debugger/requestArgs";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();

export class NodeVersionHelper {
    private static nvsStandardArchName(arch: string): string {
        switch (arch) {
            case "32":
            case "x86":
            case "ia32":
                return "x86";
            case "64":
            case "x64":
            case "amd64":
                return "x64";
            case "arm":
                const arm_version = (process.config.variables as any).arm_version;
                return arm_version ? `armv${arm_version}l` : "arm";
            default:
                return arch;
        }
    }

    /**
     * Parses a node version string into remote name, semantic version, and architecture
     * components. Infers some unspecified components based on configuration.
     */
    private static parseVersionString(versionString: string): {
        nvsFormat: boolean;
        remoteName: string;
        semanticVersion: string;
        arch: string;
    } {
        const versionRegex =
            /^(([\w-]+)\/)?(v?(\d+(\.\d+(\.\d+)?)?))(\/((x86)|(32)|((x)?64)|(arm\w*)|(ppc\w*)))?$/i;

        const match = versionRegex.exec(versionString);
        if (!match) {
            throw ErrorHelper.getInternalError(
                InternalErrorCode.InvalidVersionString,
                versionString,
            );
        }

        const nvsFormat = !!(match[2] || match[8]);
        const remoteName = match[2] || "node";
        const semanticVersion = match[4] || "";
        const arch = NodeVersionHelper.nvsStandardArchName(match[8] || process.arch);

        return { nvsFormat, remoteName, semanticVersion, arch };
    }

    /**
     * if a runtime version is specified we prepend env.PATH with the folder that corresponds to the version.
     * Returns false on error
     */
    public static nvmSupport(config: ICordovaAttachRequestArgs | ICordovaLaunchRequestArgs): void {
        let bin: string | undefined;
        let versionManagerName: string | undefined;

        // first try the Node Version Switcher 'nvs'
        let nvsHome = process.env.NVS_HOME;
        if (!nvsHome) {
            // NVS_HOME is not always set. Probe for 'nvs' directory instead
            const nvsDir =
                process.platform === "win32"
                    ? path.join(process.env.LOCALAPPDATA || "", "nvs")
                    : path.join(process.env.HOME || "", ".nvs");
            if (fs.existsSync(nvsDir)) {
                nvsHome = nvsDir;
            }
        }

        const { nvsFormat, remoteName, semanticVersion, arch } =
            NodeVersionHelper.parseVersionString(config.runtimeVersion);

        if (nvsFormat || nvsHome) {
            if (nvsHome) {
                bin = path.join(nvsHome, remoteName, semanticVersion, arch);
                if (process.platform !== "win32") {
                    bin = path.join(bin, "bin");
                }
                versionManagerName = "nvs";
            } else {
                throw ErrorHelper.getInternalError(InternalErrorCode.NvsHomeNotFoundMessage);
            }
        }

        if (!bin) {
            // now try the Node Version Manager "nvm"
            if (process.platform === "win32") {
                const nvmHome = process.env.NVM_HOME;
                if (!nvmHome) {
                    throw ErrorHelper.getInternalError(InternalErrorCode.NvmWindowsNotFoundMessage);
                }
                bin = path.join(nvmHome, `v${config.runtimeVersion}`);
                versionManagerName = "nvm-windows";
            } else {
                // macOS and linux
                let nvmHome = process.env.NVM_DIR;
                if (!nvmHome) {
                    // if NVM_DIR is not set. Probe for '.nvm' directory instead
                    const nvmDir = path.join(process.env.HOME || "", ".nvm");
                    if (fs.existsSync(nvmDir)) {
                        nvmHome = nvmDir;
                    }
                }
                if (!nvmHome) {
                    throw ErrorHelper.getInternalError(InternalErrorCode.NvmHomeNotFoundMessage);
                }
                bin = path.join(nvmHome, "versions", "node", `v${config.runtimeVersion}`, "bin");
                versionManagerName = "nvm";
            }
        }

        if (fs.existsSync(bin)) {
            if (!config.env) {
                config.env = {};
            }
            if (process.platform === "win32") {
                process.env.Path = `${bin};${process.env.Path}`;
            } else {
                process.env.PATH = `${bin}:${process.env.PATH}`;
            }
        } else {
            throw ErrorHelper.getInternalError(
                InternalErrorCode.RuntimeVersionNotFoundMessage,
                config.runtimeVersion,
                versionManagerName,
            );
        }
    }
}
