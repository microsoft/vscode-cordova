// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

var child_process = require('child_process');
var fs = require('fs');
var gulp = require('gulp');
var mocha = require('gulp-mocha');
var sourcemaps = require('gulp-sourcemaps');
var ts = require('gulp-typescript');
var log = require('gulp-util').log;
var os = require('os');
var path = require('path');
var Q = require('q');
var typescript = require('typescript');

function executeCordovaCommand(cwd, command) {
    var cordovaCmd = os.platform() === "darwin" ? "cordova" : "cordova.cmd";
    var commandToExecute = cordovaCmd + " " + command;
    return executeCommand(cwd, commandToExecute);
}

function executeCommand(cwd, commandToExecute) {
    var deferred = Q.defer();
    var process = child_process.exec(commandToExecute, { cwd: cwd }, (error, stdout, stderr) => {
        if (error) {
            console.error("An error occurred: " + error);
            return;
        }
        console.log(stderr);
        console.log(stdout);
    });
    process.on("error", function (err) {
        console.log("Command failed with error: " + err);
        deferred.reject(err);
    });
    process.stdout.on("close", function (exitCode) {
        if (exitCode) {
            console.log("Command failed with exit code " + exitCode);
            deferred.reject(exitCode);
        }
        else {
            deferred.resolve({});
        }
    });
    return deferred.promise;
}

var sources = [
    'src',
    'test/debugger',
    'typings',
    'debugger/adapter',
    'debugger/common',
    'debugger/test',
    'debugger/webkit',
].map(function(tsFolder) { return tsFolder + '/**/*.ts'; })
.concat(['test/*.ts']);

var projectConfig = {
    noImplicitAny: false,
    target: 'ES5',
    module: 'commonjs',
    declarationFiles: true,
    typescript: typescript
};

gulp.task('build', function () {
    return gulp.src(sources, { base: '.' })
        .pipe(sourcemaps.init())
        .pipe(ts(projectConfig))
        .pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: __dirname }))
        .pipe(gulp.dest('out'));
});

gulp.task('watch', ['build'], function(cb) {
    log('Watching build sources...');
    return gulp.watch(sources, ['build']);
});

gulp.task('default', ['build']);

// Don't lint code from tsd or common, and whitelist my files under adapter
var lintSources = [
    'src/cordova.ts',
    'src/utils/cordovaCommandHelper.ts',
    'src/utils/cordovaProjectHelper.ts',
    'src/utils/tsdHelper.ts',
    'src/debugger',
    'test/debugger',
    'debugger/test',
    'debugger/test',
    'debugger/webkit',
].map(function(tsFolder) { return tsFolder + '/**/*.ts'; });
lintSources = lintSources.concat([
    'debugger/adapter/sourceMaps/sourceMapTransformer.ts',
    'debugger/adapter/adapterProxy.ts',
    'debugger/adapter/lineNumberTransformer.ts',
    'debugger/adapter/pathTransformer.ts',
]);

var tslint = require('gulp-tslint');
gulp.task('tslint', function(){
      return gulp.src(lintSources, { base: '.' })
        .pipe(tslint())
        .pipe(tslint.report('verbose'));
});

function test() {
    return gulp.src('out/debugger/test/**/*.test.js', { read: false })
        .pipe(mocha({ ui: 'tdd' }))
        .on('error', function(e) {
            log(e ? e.toString() : 'error in test task!');
            this.emit('end');
        });
}

gulp.task('build-test', ['build'], test);
gulp.task('test', test);

gulp.task('prepare-integration-tests', ['build'], function() {
    return executeCordovaCommand(path.resolve(__dirname, "test", "testProject"), "plugin add cordova-plugin-file");
});

gulp.task('watch-build-test', ['build', 'build-test'], function() {
    return gulp.watch(sources, ['build', 'build-test']);
});

gulp.task('release', function () {
    var licenseFiles = ["LICENSE.txt", "ThirdPartyNotices.txt"];
    var backupFolder = path.resolve(path.join(os.tmpdir(), 'vscode-cordova'));
    if (!fs.existsSync(backupFolder)) {
        fs.mkdirSync(backupFolder);
    }

    return Q({})
        .then(function () {
            /* back up LICENSE.txt, ThirdPartyNotices.txt, README.md */
            console.log("Backing up license files to " + backupFolder + " ...");
            licenseFiles.forEach(function (fileName) {
                fs.writeFileSync(path.join(backupFolder, fileName), fs.readFileSync(fileName));
            });

            /* copy over the release package license files */
            console.log("Preparing license files for release...");
            fs.writeFileSync('LICENSE.txt', fs.readFileSync('release/releaselicense.txt'));
            fs.writeFileSync('ThirdPartyNotices.txt', fs.readFileSync('release/release3party.txt'));

            console.log("Creating release package...");
            return executeCommand(path.resolve(__dirname), 'node ./node_modules/.bin/vsce package');
        }).then(function () {
            /* restore backed up files */
            console.log("Restoring modified files...");
            licenseFiles.forEach(function (fileName) {
                fs.writeFileSync(path.join(__dirname, fileName), fs.readFileSync(path.join(backupFolder, fileName)));
            });
        });
});