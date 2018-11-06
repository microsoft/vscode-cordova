// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

let testRunner = require("vscode/lib/testrunner");

// You can directly control Mocha options by uncommenting the following lines
// See https://github.com/mochajs/mocha/wiki/Using-mocha-programmatically#set-options for more info
testRunner.configure({
    ui: "tdd", 		// the TDD UI is being used in extension.test.ts (suite, test, etc.)
    useColors: true, // colored output from test results
    timeout: 150000,
});

module.exports = testRunner;