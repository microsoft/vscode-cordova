const del = require("del");

const clean = () => {
    const pathsToDelete = [
        "src/**/*.js",
        "src/**/*.js.map",
        "test/**/*.js",
        "test/**/*.js.map",
        "out/",
        "dist",
        "!test/resources/testCordovaProject/**/*.js",
        "!test/resources/testCordovaProject/**/*.js.map",
        ".vscode-test/",
        "nls.*.json",
        "!test/smoke/**/*",
    ];
    return del(pathsToDelete, { force: true });
};

module.exports = {
    clean,
};
