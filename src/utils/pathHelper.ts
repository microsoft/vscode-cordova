// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";

/**
 * Join path segments properly based on whether they appear to be c:/ -style or / style.
 * Note - must check posix first because win32.isAbsolute includes posix.isAbsolute
 */
export function properJoin(...segments: string[]): string {
    if (path.posix.isAbsolute(segments[0])) {
        return path.posix.join(...segments);
    } else if (path.win32.isAbsolute(segments[0])) {
        return path.win32.join(...segments);
    } else {
        return path.join(...segments);
    }
}
