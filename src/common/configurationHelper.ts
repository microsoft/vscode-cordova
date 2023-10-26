// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { ConfigurationReader } from "./configurationReader";

export class ConfigurationHelper {
    public static getAndroidInsecureFileModeStatus(xmlContent: any): boolean {
        const jsonContent = ConfigurationReader.parseXmlToJson(xmlContent);
        const preferenceList = jsonContent.widget.preference ? jsonContent.widget.preference : null;

        if (preferenceList) {
            for (let i = 0; i < preferenceList.length; i++) {
                const preference = JSON.stringify(preferenceList[i]);
                if (preference.includes("AndroidInsecureFileModeEnabled")) {
                    return !!preference.includes("false");
                }
                return true;
            }
        }
        return true;
    }
}
