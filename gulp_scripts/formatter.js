const gulp = require("gulp");
const { series } = require("gulp");
const cp = require("child_process");

const runPrettier = async fix => {
    const child = cp.fork(
        "./node_modules/@mixer/parallel-prettier/dist/index.js",
        [
            fix ? "--write" : "--list-different",
            "test/**/*.ts",
            "gulpfile.js",
            "*.md",
            "!CHANGELOG.md",
            "!src/**/*.d.ts",
            "src/**/*.ts",
            "!test/resources",
            "!test/resources/**/**/*.d.ts",
            "!test/resources/**/**",
        ],
        {
            stdio: "inherit",
        },
    );
    await new Promise((resolve, reject) => {
        child.on("exit", code => {
            // console.log(code);
            code ? reject(`Prettier exited with code ${code}`) : resolve();
        });
    });
};

/**
 * @typedef {{color: boolean, fix: boolean}} OptionsT
 */

/**
 * @param {OptionsT} options_
 */
const runEslint = async options_ => {
    /** @type {OptionsT} */
    const options = Object.assign({ color: true, fix: false }, options_);

    const files = ["../src/**/*.ts"];

    const args = [
        ...(options.color ? ["--color"] : ["--no-color"]),
        ...(options.fix ? ["--fix"] : []),
        ...files,
    ];

    const child = cp.fork("../node_modules/eslint/bin/eslint.js", args, {
        stdio: "inherit",
        cwd: __dirname,
    });

    await new Promise((resolve, reject) => {
        child.on("exit", code => {
            code ? reject(`Eslint exited with code ${code}`) : resolve();
        });
    });
};

function runPrettierForFormat(cb) {
    runPrettier(true);
    cb();
}

function runEsLintForFormat(cb) {
    runEslint({ fix: true });
    cb();
}
const format = gulp.series(runPrettierForFormat, runEsLintForFormat);

function runPrettierForLint(cb) {
    runPrettier(false);
    cb();
}

function runEslintForLint(cb) {
    runEslint({ fix: false });
    cb();
}

const lint = gulp.series(runPrettierForLint, runEslintForLint);

module.exports = {
    runPrettierForFormat,
    runEsLintForFormat,
    runPrettierForLint,
    runEslintForLint,
    format,
    lint,
};
