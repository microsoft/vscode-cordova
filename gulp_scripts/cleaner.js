const del = require("del");

const clean = () => {
    const pathsToDelete = [
        "../src/**/*.js",
        "src/**/*.js.map",
        "out/",
        "dist",
        "!test/resources/sampleReactNativeProject/**/*.js",
        ".vscode-test/",
        "src/**/*nls.*.json",
        "!test/smoke/**/*",
    ];
    return del(pathsToDelete, { force: true });
};

module.exports = {
    clean,
};
