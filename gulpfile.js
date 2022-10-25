// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

const path = require("path");
const ts = require("gulp-typescript");
const GulpExtras = require("./tools/gulp-extras");
const minimist = require("minimist");
const os = require("os");
const fs = require("fs");
const webpack = require("webpack");
const filter = require("gulp-filter");
const cp = require("child_process");
const executeCommand = GulpExtras.executeCommand;

global.appRoot = path.resolve(__dirname);

const getFormatter = require("./gulp_scripts/formatter");
const getWebpackBundle = require("./gulp_scripts/webpackBundle");
const getCleaner = require("./gulp_scripts/cleaner");
const getBuilder = require("./gulp_scripts/builder");
const getTester = require("./gulp_scripts/tester");
const getWatcher = require("./gulp_scripts/watcher");
const getPacker = require("./gulp_scripts/packager");
const getRelease = require("./gulp_scripts/release");
const getTranslator = require("./gulp_scripts/translator");

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
    package: getPacker.package,
    release: getRelease.release,
    "add-i18n": getTranslator.addi18n,
    "translations-export": getTranslator.translationsExport,
    "translations-import": getTranslator.translationImport,
};
