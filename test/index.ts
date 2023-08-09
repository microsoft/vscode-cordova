// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as Mocha from "mocha";
import * as glob from "glob";

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: "tdd",
        grep: new RegExp("(smokeTestsContext|localizationContext)"),
        color: true,
        reporter: "mocha-multi-reporters",
        reporterOptions: {
            reporterEnabled: "mocha-junit-reporter, mochawesome",
            mochaJunitReporterReporterOptions: {
                mochaFile: path.join(__dirname, "ExtensionTests.xml"),
            },
            mochawesomeReporterOptions: {
                reportDir: `${path.resolve(__dirname, "..")}/mochawesome-report`,
                reportFilename: "Cordova-Test-Report",
                quiet: true,
            },
        },
        timeout: 150000,
    });

    mocha.invert();

    const testsRoot = __dirname;
    // Register Mocha options
    return new Promise((resolve, reject) => {
        glob("**/**.test.js", { cwd: testsRoot }, (err, files) => {
            if (err) {
                return reject(err);
            }

            // Add files to the test suite
            files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                // Run the mocha test
                mocha.run((failures: any) => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests failed.`));
                    } else {
                        resolve();
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    });
}
