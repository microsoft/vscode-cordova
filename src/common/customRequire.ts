// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

// Portion of code was taken from https://github.com/sindresorhus/ow/blob/d62a06c192b892d504887f0b97fdc842e8cbf862/source/utils/node/require.ts
let customRequire: (packageName: string) => any;

try {
    // Export `__non_webpack_require__` in Webpack environments to make sure it doesn't bundle modules loaded via this method
    customRequire = (global as any).__non_webpack_require__ === "function"
        ? (global as any).__non_webpack_require__
        : eval("require"); // tslint:disable-line:no-eval
} catch {
    // Use a noop in case both `__non_webpack_require__` and `require` does not exist
    customRequire = () => {}; // eslint-disable-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-empty-function
}

export default customRequire;