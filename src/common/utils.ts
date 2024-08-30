// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as fs from "fs";
import * as net from "net";
import { Address4, Address6 } from "ip-address";

export function isDirectory(dir: string): boolean {
    try {
        return fs.statSync(dir).isDirectory();
    } catch {
        return false;
    }
}

export function ipToBuffer(ip: string): Buffer {
    if (net.isIPv4(ip)) {
        // Handle IPv4 addresses
        const address = new Address4(ip);
        return Buffer.from(address.toArray());
    } else if (net.isIPv6(ip)) {
        // Handle IPv6 addresses
        const address = new Address6(ip);
        return Buffer.from(address.toByteArray());
    }
    throw new Error("Invalid IP address format.");
}
