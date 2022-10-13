// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

const gulp = require("gulp");
const log = require("fancy-log");
const sourcemaps = require("gulp-sourcemaps");
const path = require("path");
const preprocess = require("gulp-preprocess");
const ts = require("gulp-typescript");
const GulpExtras = require("./tools/gulp-extras");
const minimist = require("minimist");
const os = require("os");
const fs = require("fs");
const es = require("event-stream");
const nls = require("vscode-nls-dev");
const webpack = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");
const filter = require("gulp-filter");
const del = require("del");
const vscodeTest = require("vscode-test");
const cp = require("child_process");
const executeCommand = GulpExtras.executeCommand;
const tsProject = ts.createProject("tsconfig.json");

global.appRoot = path.resolve(__dirname);

const getFormatter = require("./gulp_scripts/formatter");
const getWebpackBundle = require("./gulp_scripts/webpackBundle");
const getCleaner = require("./gulp_scripts/cleaner");
const getBuilder = require("./gulp_scripts/builder");
const getTester = require("./gulp_scripts/tester");
const getWatcher = require("./gulp_scripts/watcher");
// const getPacker = require("./gulp_scripts/packager");
// const getRelease = require("./gulp_scripts/release");
// const getTranslator = require("./gulp_scripts/translator");

/**
 * Whether we're running a nightly build.
 */
const isNightly = process.argv.includes("--nightly");

const vscodeVersionForTests = "stable";

const fullExtensionName = isNightly ? "msjsdiag.vscode-cordova-preview" : "msjsdiag.vscode-cordova";

const extensionName = isNightly ? "vscode-cordova-preview" : "vscode-cordova";

const buildDir = "src";

const translationProjectName = "vscode-extensions";

const srcPath = "src";
const testPath = "test";
const distDir = "dist";
const distSrcDir = `${distDir}/src`;

const sources = [srcPath, testPath].map(tsFolder => tsFolder + "/**/*.ts");

let lintSources = [srcPath, testPath].map(tsFolder => tsFolder + "/**/*.ts");
lintSources = lintSources.concat([
    "!src/typings/**",
    "!test/resources/testCordovaProject/**",
    "!test/smoke/**",
    "!/SmokeTestLogs/**",
]);

// async function test(inspectCodeCoverage = false) {
//     // Check if arguments were passed
//     if (options.pattern) {
//         log(`\nTesting cases that match pattern: ${options.pattern}`);
//     } else {
//         log(`\nTesting cases that don't match pattern: extensionContext|localizationContext`);
//     }

//     try {
//         // The folder containing the Extension Manifest package.json
//         // Passed to `--extensionDevelopmentPath`
//         const extensionDevelopmentPath = __dirname;

//         // The path to the extension test runner script
//         // Passed to --extensionTestsPath
//         const extensionTestsPath = path.resolve(__dirname, "test", "index");
//         console.log(extensionTestsPath);
//         // Download VS Code, unzip it and run the integration test

//         const testOptions = {
//             extensionDevelopmentPath,
//             extensionTestsPath,
//             version: vscodeVersionForTests,
//         };

//         // Activate inspection of code coverage with unit tests
//         if (inspectCodeCoverage) {
//             testOptions.extensionTestsEnv = {
//                 COVERAGE: "true",
//             };
//         }

//         await vscodeTest.runTests(testOptions);
//     } catch (err) {
//         console.error(err);
//         console.error("Failed to run tests");
//         process.exit(1);
//     }
// }

// const quickBuild = gulp.series(buildDev);

// const watch = gulp.series(getBuilder.buildTask, function runWatch() {
//     log("Watching build sources...");
//     return gulp.watch(sources, gulp.series(getBuilder.buildTask));
// });

// const runTest = gulp.series(getBuilder.buildTask, getFormatter.lint, test);

// const testNoBuild = test;

// const testCoverage = gulp.series(getBuilder.quickBuild, async function () {
//     await test(true);
// });

// const watchBuildTest = gulp.series(getBuilder.buildTask, runTest, function runWatch() {
//     return gulp.watch(sources, gulp.series(getBuilder.buildTask, runTest));
// });

const package = callback => {
    const command = path.join(__dirname, "node_modules", ".bin", "vsce");
    const args = ["package"];
    executeCommand(command, args, callback);
};

function readJson(file) {
    const contents = fs.readFileSync(path.join(__dirname, file), "utf-8").toString();
    return JSON.parse(contents);
}

function writeJson(file, jsonObj) {
    const content = JSON.stringify(jsonObj, null, 2);
    fs.writeFileSync(path.join(__dirname, file), content);
}

/**
 * Generate version number for a nightly build.
 */
const getVersionNumber = () => {
    const date = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));

    return [
        // YY
        date.getFullYear(),
        // MM,
        date.getMonth() + 1,
        //DDHH
        `${date.getDate()}${String(date.getHours()).padStart(2, "0")}`,
    ].join(".");
};

const release = function prepareLicenses() {
    const backupFiles = [
        "LICENSE.txt",
        "ThirdPartyNotices.txt",
        "package.json",
        "package-lock.json",
    ];
    const backupFolder = path.resolve(path.join(os.tmpdir(), "vscode-cordova"));
    if (!fs.existsSync(backupFolder)) {
        fs.mkdirSync(backupFolder);
    }

    return Promise.resolve()
        .then(() => {
            /* back up LICENSE.txt, ThirdPartyNotices.txt, README.md */
            log("Backing up license files to " + backupFolder + "...");
            backupFiles.forEach(fileName => {
                fs.writeFileSync(path.join(backupFolder, fileName), fs.readFileSync(fileName));
            });

            /* copy over the release package license files */
            log("Preparing license files for release...");
            fs.writeFileSync("LICENSE.txt", fs.readFileSync("release/LICENSE.txt"));
            fs.writeFileSync(
                "ThirdPartyNotices.txt",
                fs.readFileSync("release/ThirdPartyNotices.txt"),
            );
        })
        .then(() => {
            let packageJson = readJson("package.json");
            packageJson.main = "./dist/cordova";
            if (isNightly) {
                log("Performing nightly release...");
                packageJson.version = getVersionNumber();
                packageJson.name = extensionName;
                packageJson.preview = true;
                packageJson.displayName += " (Preview)";
            }
            writeJson("package.json", packageJson);
            log("Creating release package...");
            return new Promise((resolve, reject) => {
                // NOTE: vsce must see npm 3.X otherwise it will not correctly strip out dev dependencies.
                executeCommand(
                    "vsce",
                    ["package"],
                    arg => {
                        if (arg) {
                            reject(arg);
                        }
                        resolve();
                    },
                    { cwd: path.resolve(__dirname) },
                );
            });
        })
        .finally(() => {
            /* restore backed up files */
            log("Restoring modified files...");
            backupFiles.forEach(fileName => {
                fs.writeFileSync(
                    path.join(__dirname, fileName),
                    fs.readFileSync(path.join(backupFolder, fileName)),
                );
            });
        });
};

// Creates package.i18n.json files for all languages from {workspaceRoot}/i18n folder into project root
const addi18n = () => {
    return gulp
        .src(["package.nls.json"])
        .pipe(nls.createAdditionalLanguageFiles(defaultLanguages, "i18n"))
        .pipe(gulp.dest("."));
};

// Creates MLCP readable .xliff file and saves it locally

const translationExport = gulp.series(getBuilder.buildTask, function runTranslationExport() {
    return gulp
        .src(["package.nls.json", "nls.metadata.header.json", "nls.metadata.json"])
        .pipe(nls.createXlfFiles(translationProjectName, fullExtensionName))
        .pipe(gulp.dest(path.join("..", `${translationProjectName}-localization-export`)));
});

// Imports localization from raw localized MLCP strings to VS Code .i18n.json files
const translationImport = gulp.series(done => {
    var options = minimist(process.argv.slice(2), {
        string: "location",
        default: {
            location: "../vscode-translations-import",
        },
    });
    es.merge(
        defaultLanguages.map(language => {
            let id = language.transifexId || language.id;
            log(path.join(options.location, id, "vscode-extensions", `${fullExtensionName}.xlf`));
            return gulp
                .src(
                    path.join(
                        options.location,
                        id,
                        "vscode-extensions",
                        `${fullExtensionName}.xlf`,
                    ),
                )
                .pipe(nls.prepareJsonFiles())
                .pipe(gulp.dest(path.join("./i18n", language.folderName)));
        }),
    ).pipe(
        es.wait(() => {
            done();
        }),
    );
}, addi18n);

module.exports = {
    "format:prettier": getFormatter.runPrettierForFormat,
    "format:eslint": getFormatter.runEsLintForFormat,
    format: getFormatter.format,
    "lint:prettier": getFormatter.runPrettierForLint,
    "lint:eslint": getFormatter.runEslintForLint,
    lint: getFormatter.lint,
    "webpack-bundle": getWebpackBundle.webpackBundle,
    clean: getCleaner.clean,
    build: getBuilder.buildTask,
    "build-src": getBuilder.buildSrc,
    "build-dev": getBuilder.buildDev,
    "quick-build": getBuilder.quickBuild,
    watch: getWatcher.watch,
    "prod-build": getBuilder.prodBuild,
    default: getBuilder.defaultTask,
    test: getTester.test,
    "test-no-build": getTester.testNoBuild,
    "test:coverage": getTester.testCoverage,
    "watch-build-test": getWatcher.watchBuildTest,
    package: package,
    release: release,
    "add-i18n": addi18n,
    "translations-export": translationExport,
    "translations-import": translationImport,
};
