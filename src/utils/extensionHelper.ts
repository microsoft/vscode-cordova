// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

export function generateRandomPortNumber() {
    return Math.round(Math.random() * 40000 + 3000);
}
