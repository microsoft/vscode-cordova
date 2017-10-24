// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as child_process from 'child_process';
import {CordovaProjectHelper} from '../utils/cordovaProjectHelper';
import * as os from 'os';
import * as Q from 'q';
import * as path from 'path';
import * as util from 'util';
import * as semver from 'semver';
import { ExtensionMessageSender, ExtensionMessage } from '../common/extensionMessaging';

// suppress the following strings because they are not actual errors:
const errorsToSuppress = ['Run an Ionic project on a connected device'];

export function execCommand(command: string, args: string[], errorLogger: (message: string) => void): Q.Promise<string> {
    let deferred = Q.defer<string>();
    let proc = child_process.spawn(command, args, { stdio: 'pipe' });
    let stderr = '';
    let stdout = '';
    proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
    });
    proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
    });
    proc.on('error', (err: Error) => {
        deferred.reject(err);
    });
    proc.on('close', (code: number) => {
        if (code !== 0) {
            errorLogger(stderr);
            errorLogger(stdout);
            deferred.reject(`Error running '${command} ${args.join(' ')}'`);
        }
        deferred.resolve(stdout);
    });

    return deferred.promise;
}

export function cordovaRunCommand(args: string[], cordovaRootPath: string): Q.Promise<string[]> {
    let defer = Q.defer<string[]>();
    let isIonicProject = CordovaProjectHelper.isIonicProject(cordovaRootPath);
    let cliName = isIonicProject ? 'ionic' : 'cordova';
    let output = '';
    let stderr = '';
    let cordovaProcess = cordovaStartCommand(args, cordovaRootPath);

    // Prevent these lines to be shown more than once
    // to prevent debug console pollution
    let isShown = {
        'Running command': false,
        'cordova prepare': false,
        'cordova platform add': false
    };

    cordovaProcess.stderr.on('data', data => {
        stderr += data.toString();
        for (var i = 0; i < errorsToSuppress.length; i++) {
            if (data.toString().indexOf(errorsToSuppress[i]) >= 0) {
                return;
            }
        }
        defer.notify([data.toString(), 'stderr']);
    });
    cordovaProcess.stdout.on('data', (data: Buffer) => {
        let str = data.toString().replace(/\u001b/g, '').replace(/\[2K\[G/g, ''); // Erasing `[2K[G` artifacts from DEBUG CONSOLE output
        output += str;
        for (let message in isShown)  {
            if (str.indexOf(message) > -1) {
                if (!isShown[message]) {
                    isShown[message] = true;
                    defer.notify([str, 'stdout']);
                }
                return;
            }
        }
        defer.notify([str, 'stdout']);

        if (isIonicProject && str.indexOf('LAUNCH SUCCESS') >= 0) {
            defer.resolve([output, stderr]);
        }
    });
    cordovaProcess.on('exit', exitCode => {
        if (exitCode) {
            defer.reject(new Error(util.format('\'%s %s\' failed with exit code %d', cliName, args.join(' '), exitCode)));
        } else {
            defer.resolve([output, stderr]);
        }
    });
    cordovaProcess.on('error', error => {
        defer.reject(error);
    });

    return defer.promise;
}

export function cordovaStartCommand(args: string[], cordovaRootPath: string): child_process.ChildProcess {
    let cliName = CordovaProjectHelper.isIonicProject(cordovaRootPath) ? 'ionic' : 'cordova';
    let commandExtension = os.platform() === 'win32' ? '.cmd' : '';
    let command = cliName + commandExtension;
    let isIonicServe: boolean = args.indexOf('serve') >= 0;

    if (cliName === 'ionic' && !isIonicServe) {
        try {
            let ionicInfo = child_process.spawnSync(command, ['-v', '--quiet'], {
                cwd: cordovaRootPath
            });
            let ionicVersion = ionicInfo.stdout.toString().trim();
            if (semver.gte(ionicVersion, '3.0.0')) {
                args.unshift('cordova');
            }
        } catch (err) {
            console.error('Error while detecting Ionic CLI version', err);
        }
    }

    if (cliName === 'ionic') {
        args.push('--no-interactive');
    } else {
        args.push('--no-update-notifier');
    }

    return child_process.spawn(command, args, { cwd: cordovaRootPath });
}

export function killTree(processId: number): void {
    const cmd = process.platform === 'win32' ?
        `taskkill.exe /F /T /PID` :
        path.join(__dirname, '../../../scripts/terminateProcess.sh')

    try {
        child_process.execSync(`${cmd} ${processId}`);
    } catch (err) {
    }
}

export function killChildProcess(childProcess: child_process.ChildProcess): Q.Promise<void> {
    killTree(childProcess.pid);
    return Q<void>(void 0);
}
