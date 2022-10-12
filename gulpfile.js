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

/**
 * Whether we're running a nightly build.
 */
const isNightly = process.argv.includes("--nightly");

const vscodeVersionForTests = "stable";

const fullExtensionName = isNightly ? "msjsdiag.vscode-cordova-preview" : "msjsdiag.vscode-cordova";

const extensionName = isNightly ? "vscode-cordova-preview" : "vscode-cordova";

const buildDir = "src";

const translationProjectName = "vscode-extensions";
const defaultLanguages = [
    { id: "zh-tw", folderName: "cht", transifexId: "zh-hant" },
    { id: "zh-cn", folderName: "chs", transifexId: "zh-hans" },
    { id: "ja", folderName: "jpn" },
    { id: "ko", folderName: "kor" },
    { id: "de", folderName: "deu" },
    { id: "fr", folderName: "fra" },
    { id: "es", folderName: "esn" },
    { id: "ru", folderName: "rus" },
    { id: "it", folderName: "ita" },

    // These language-pack languages are included for VS but excluded from the vscode package
    { id: "cs", folderName: "csy" },
    { id: "tr", folderName: "trk" },
    { id: "pt-br", folderName: "ptb", transifexId: "pt-BR" },
    { id: "pl", folderName: "plk" },
];

const srcPath = "src";
const testPath = "test";
const distDir = "dist";
const distSrcDir = `${distDir}/src`;

const sources = [srcPath, testPath].map(tsFolder => tsFolder + "/**/*.ts");

const knownOptions = {
    string: "env",
    default: { env: "production" },
};

const options = minimist(process.argv.slice(2), knownOptions);

let lintSources = [srcPath, testPath].map(tsFolder => tsFolder + "/**/*.ts");
lintSources = lintSources.concat([
    "!src/typings/**",
    "!test/resources/testCordovaProject/**",
    "!test/smoke/**",
    "!/SmokeTestLogs/**",
]);

// async function runWebpack({
//     packages = [],
//     devtool = false,
//     compileInPlace = false,
//     mode = process.argv.includes("watch") ? "development" : "production",
// } = options) {
//     let configs = [];
//     for (const { entry, library, filename } of packages) {
//         const config = {
//             mode,
//             target: "node",
//             entry: path.resolve(entry),
//             output: {
//                 path: compileInPlace ? path.resolve(path.dirname(entry)) : path.resolve(distDir),
//                 filename: filename || path.basename(entry).replace(".js", ".bundle.js"),
//                 devtoolModuleFilenameTemplate: "../[resource-path]",
//             },
//             devtool: devtool,
//             resolve: {
//                 extensions: [".js", ".ts", ".json"],
//             },
//             module: {
//                 rules: [
//                     {
//                         test: /\.ts$/,
//                         exclude: /node_modules/,
//                         use: [
//                             {
//                                 // vscode-nls-dev loader:
//                                 // * rewrite nls-calls
//                                 loader: "vscode-nls-dev/lib/webpack-loader",
//                                 options: {
//                                     base: path.join(__dirname),
//                                 },
//                             },
//                             {
//                                 // configure TypeScript loader:
//                                 // * enable sources maps for end-to-end source maps
//                                 loader: "ts-loader",
//                                 options: {
//                                     compilerOptions: {
//                                         sourceMap: true,
//                                     },
//                                 },
//                             },
//                         ],
//                     },
//                 ],
//             },
//             optimization: {
//                 minimize: true,
//                 minimizer: [
//                     new TerserPlugin({
//                         terserOptions: {
//                             format: {
//                                 comments: /^\**!|@preserve/i,
//                             },
//                         },
//                         extractComments: false,
//                     }),
//                 ],
//             },
//             node: {
//                 __dirname: false,
//                 __filename: false,
//             },
//             externals: {
//                 vscode: "commonjs vscode",
//             },
//         };

//         if (library) {
//             config.output.libraryTarget = "commonjs2";
//         }

//         if (process.argv.includes("--analyze-size")) {
//             config.plugins = [
//                 new (require("webpack-bundle-analyzer").BundleAnalyzerPlugin)({
//                     analyzerMode: "static",
//                     reportFilename: path.resolve(distSrcDir, path.basename(entry) + ".html"),
//                 }),
//             ];
//         }

//         configs.push(config);
//     }

//     await new Promise((resolve, reject) =>
//         webpack(configs, (err, stats) => {
//             if (err) {
//                 reject(err);
//             } else if (stats.hasErrors()) {
//                 reject(stats);
//             } else {
//                 resolve();
//             }
//         }),
//     );
// }

// Generates ./dist/nls.bundle.<language_id>.json from files in ./i18n/** *//<src_path>/<filename>.i18n.json
// Localized strings are read from these files at runtime.
const generateSrcLocBundle = () => {
    // Transpile the TS to JS, and let vscode-nls-dev scan the files for calls to localize.
    return tsProject
        .src()
        .pipe(sourcemaps.init())
        .pipe(tsProject())
        .js.pipe(nls.createMetaDataFiles())
        .pipe(nls.createAdditionalLanguageFiles(defaultLanguages, "i18n"))
        .pipe(nls.bundleMetaDataFiles(fullExtensionName, "dist"))
        .pipe(nls.bundleLanguageFiles())
        .pipe(
            filter([
                "**/nls.bundle.*.json",
                "**/nls.metadata.header.json",
                "**/nls.metadata.json",
                "!src/**",
            ]),
        )
        .pipe(gulp.dest("dist"));
};

function build(failOnError, buildNls) {
    const isProd = options.env === "production";
    const preprocessorContext = isProd ? { PROD: true } : { DEBUG: true };
    let gotError = false;
    log(`Building with preprocessor context: ${JSON.stringify(preprocessorContext)}`);
    const tsResult = tsProject
        .src()
        .pipe(preprocess({ context: preprocessorContext })) //To set environment variables in-line
        .pipe(sourcemaps.init())
        .pipe(tsProject());

    return tsResult.js
        .pipe(buildNls ? nls.rewriteLocalizeCalls() : es.through())
        .pipe(
            buildNls
                ? nls.createAdditionalLanguageFiles(defaultLanguages, "i18n", ".")
                : es.through(),
        )
        .pipe(buildNls ? nls.bundleMetaDataFiles(fullExtensionName, ".") : es.through())
        .pipe(buildNls ? nls.bundleLanguageFiles() : es.through())
        .pipe(sourcemaps.write(".", { includeContent: false, sourceRoot: "." }))
        .pipe(gulp.dest(file => file.cwd))
        .once("error", () => {
            gotError = true;
        })
        .once("finish", () => {
            if (failOnError && gotError) {
                process.exit(1);
            }
        });
}

async function test(inspectCodeCoverage = false) {
    // Check if arguments were passed
    if (options.pattern) {
        log(`\nTesting cases that match pattern: ${options.pattern}`);
    } else {
        log(`\nTesting cases that don't match pattern: extensionContext|localizationContext`);
    }

    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = __dirname;

        // The path to the extension test runner script
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, "test", "index");
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

// const webpackBundle = async () => {
//     const packages = [
//         {
//             entry: `${buildDir}/cordova.ts`,
//             filename: "rn-extension.js",
//             library: true,
//         },
//     ];
//     return runWebpack({ packages });
// };

const clean = () => {
    const pathsToDelete = [
        "src/**/*.js",
        "src/**/*.js.map",
        "out/",
        "dist",
        "!test/resources/testCordovaProject/**/*.js",
        ".vscode-test/",
        "nls.*.json",
        "!test/smoke/**/*",
    ];
    return del(pathsToDelete, { force: true });
};

// TODO: The file property should point to the generated source (this implementation adds an extra folder to the path)
// We should also make sure that we always generate urls in all the path properties (We shouldn"t have \\s. This seems to
// be an issue on Windows platforms)
const buildTask = gulp.series(getFormatter.lint, function runBuild(done) {
    build(true, true).once("finish", () => {
        done();
    });
});

const buildSrc = gulp.series(getFormatter.lint, function runBuild(done) {
    build(true, true).once("finish", () => {
        done();
    });
});

const buildDev = function runDevBuild(done) {
    build(true, false).once("finish", () => {
        done();
    });
};

const quickBuild = gulp.series(buildDev);

const watch = gulp.series(buildTask, function runWatch() {
    log("Watching build sources...");
    return gulp.watch(sources, gulp.series(buildTask));
});

const prodBuild = gulp.series(clean, getWebpackBundle.webpackBundle, generateSrcLocBundle);
const defaultTask = gulp.series(prodBuild);

const runTest = gulp.series(buildTask, getFormatter.lint, test);

const testNoBuild = test;

const testCoverage = gulp.series(quickBuild, async function () {
    await test(true);
});

const watchBuildTest = gulp.series(buildTask, runTest, function runWatch() {
    return gulp.watch(sources, gulp.series(buildTask, runTest));
});

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
            packageJson.main = "./dist/rn-extension";
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

const translationExport = gulp.series(buildTask, function runTranslationExport() {
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
    clean: clean,
    build: buildTask,
    "build-src": buildSrc,
    "build-dev": buildDev,
    "quick-build": quickBuild,
    watch: watch,
    "prod-build": prodBuild,
    default: defaultTask,
    test: test,
    "test-no-build": testNoBuild,
    "test:coverage": testCoverage,
    "watch-build-test": watchBuildTest,
    package: package,
    release: release,
    "add-i18n": addi18n,
    "translations-export": translationExport,
    "translations-import": translationImport,
};
