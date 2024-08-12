// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as fs from "fs";
import { parse } from "xcparse";

export interface PBXInfo {
    isa: string;
    buildConfigurations?: string[];
}

export class XCParseConfiguration {
    public static getPbxprojFileContent(pbxprojFilePath: string): any {
        try {
            return parse(fs.readFileSync(pbxprojFilePath, "utf-8"));
        } catch {}
    }

    public static getPBXNativeTarget(getPbxprojFileContent: any): any {
        for (const [key, value] of Object.entries(getPbxprojFileContent.objects)) {
            const configValue = value as PBXInfo;
            if (configValue.isa == "PBXNativeTarget") {
                console.log(key);
                return value;
            }
        }
        return "";
    }

    public static getPBXXCConfigurationList(getPbxprojFileContent: any, configListUUID: any): any {
        for (const [key, value] of Object.entries(getPbxprojFileContent.objects)) {
            const configValue = value as PBXInfo;
            if (configValue.isa == "XCConfigurationList") {
                if (configValue.buildConfigurations[0] == configListUUID) {
                    console.log(key);
                    return value;
                }
            }
        }
        return "";
    }
}
