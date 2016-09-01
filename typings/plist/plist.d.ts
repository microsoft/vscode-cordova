/**
 *******************************************************
 *                                                     *
 *   Copyright (C) Microsoft. All rights reserved.     *
 *                                                     *
 *******************************************************
 */

// Barebones typing for plist, added as-needed

declare module "plist" {
    export function parse(filename: string): any;
}
