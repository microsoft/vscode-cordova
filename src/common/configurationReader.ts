// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { InternalErrorCode } from "./error/internalErrorCode";
import { ErrorHelper } from "./error/errorHelper";

const parseString = require("xml2js").parseString;

export class ConfigurationReader {
    public static readArray(value: any): Array<any> {
        if (this.isArray(value)) {
            return value;
        }
        throw ErrorHelper.getInternalError(InternalErrorCode.ExpectedArrayValue, value);
    }

    private static isArray(value: any): boolean {
        return Array.isArray(value);
    }

    public static parseXmlToJson(value: any): any {
        let jsonContent;
        parseString(value, function (err, result) {
            jsonContent = result;
        });

        return jsonContent;
    }
}
