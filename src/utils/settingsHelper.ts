// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as os from "os";
import * as path from "path";
import * as nls from "vscode-nls";

nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

export function settingsHome(): string {
    switch (os.platform()) {
        case "win32":
            return path.join(process.env.APPDATA, "vscode-cordova");
        case "darwin":
        case "linux":
            return path.join(process.env.HOME, ".vscode-cordova");
        default:
            throw new Error(localize("UnexpectedPlatform", "Unexpected Platform"));
    }
}
