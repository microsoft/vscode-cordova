// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.
import * as nls from "vscode-nls";
nls.config({ messageFormat: nls.MessageFormat.bundle, bundleFormat: nls.BundleFormat.standalone })();
const localize = nls.loadMessageBundle();
export class ConfigurationReader {

    public static readArray(value: any): Array<any> {
        if (this.isArray(value)) {
            return value;
        } else {
            throw localize("ExpectedAnArrayCouldntReadValue", "Expected an array. Couldn't read {0}", value);
        }
    }

    private static isArray(value: any): boolean {
        return Array.isArray(value);
    }
}