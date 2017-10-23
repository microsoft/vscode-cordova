// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

export class ConfigurationReader {

    public static readArray(value: any): Array<any> {
        if (this.isArray(value)) {
            return value;
        } else {
            throw `Expected an array. Couldn't read ${value}`;
        }
    }

    private static isArray(value: any): boolean {
        return Array.isArray(value);
    }
}