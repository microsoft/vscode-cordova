/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as child_process from 'child_process';
import * as os from 'os';
import * as Q from 'q';

export function execCommand(command: string, errorLogger: (message: string) => void, options: any = {}): Q.Promise<string> {
    let deferred = Q.defer<string>();
    child_process.exec(command, options, (error, stdout, stderr) => {
        if (error) {
            errorLogger(stderr.toString());
            errorLogger(stdout.toString());
            deferred.reject(error);
        } else {
            deferred.resolve(stdout.toString());
        }
    });
    return deferred.promise;
    }

export function cordovaRunCommand(args: string[], errorLogger: (message: string) => void, cordovaRootPath: string): Q.Promise<string[]> {
    let defer = Q.defer<string[]>();

    let output = '';
    let stderr = '';
    let cordovaCommand = `cordova${os.platform() === 'win32' ? '.cmd' : ''}`;
    let process = child_process.spawn(cordovaCommand, args, {cwd: cordovaRootPath});
    process.stderr.on('data', data => {
        stderr += data.toString();
    });
    process.stdout.on('data', data => {
        output += data.toString();
    });
    process.on('exit', exitCode => {
        if (exitCode) {
            errorLogger(stderr);
            errorLogger(output);
            defer.reject(new Error(`'cordova ${args.join(' ')}' failed with exit code ${exitCode}.`));
        } else {
            defer.resolve([output, stderr]);
        }
    });
    process.on('error', error => {
        defer.reject(error);
    });

    return defer.promise;
}