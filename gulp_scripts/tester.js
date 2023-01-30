const gulp = require("gulp");
const log = require("fancy-log");
const minimist = require("minimist");
const path = require("path");
const vscodeTest = require("@vscode/test-electron");
const getBuilder = require("./builder");
const getFormatter = require("./formatter");

const vscodeVersionForTests = "stable";
// const distDir = appRoot + "/dist";
// const distSrcDir = `${distDir}/src`;

const knownOptions = {
    string: "env",
    default: { env: "production" },
};
const options = minimist(process.argv.slice(2), knownOptions);

async function test(inspectCodeCoverage = false) {
    // Check if arguments were passed
    if (options != null) {
        log(`\nArgument passed.`);
    } else {
        log(`\nArgument not passed.`);
    }

    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        log("__dirname: ", __dirname);
        log("appRoot: ", appRoot);
        const extensionDevelopmentPath = appRoot;

        // The path to the extension test runner script
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(appRoot, "test", "index");
        log("extensionTestsPath: ", extensionTestsPath);
        console.log(extensionTestsPath);
        // Download VS Code, unzip it and run the integration test

        const testOptions = {
            extensionDevelopmentPath,
            extensionTestsPath,
            version: vscodeVersionForTests,
        };

        // Activate inspection of code coverage with unit tests
        if (inspectCodeCoverage) {
            testOptions.extensionTestsEnv = {
                COVERAGE: "true",
            };
        }

        await vscodeTest.runTests(testOptions);
    } catch (err) {
        console.error(err);
        console.error("Failed to run tests");
        process.exit(1);
    }
}

const runTest = gulp.series(getBuilder.buildTask, getFormatter.lint, test);

const testNoBuild = test;

const testCoverage = gulp.series(getBuilder.quickBuild, async function () {
    await test(true);
});

module.exports = {
    test,
    runTest,
    testCoverage,
};
