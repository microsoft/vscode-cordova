// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

'use strict';

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as pl from 'plist';
import * as Q from 'q';

let promiseExec = Q.denodeify(child_process.exec);

export class CordovaIosDeviceLauncher {
    private static nativeDebuggerProxyInstance: child_process.ChildProcess;
    private static webDebuggerProxyInstance: child_process.ChildProcess;

    public static cleanup(): void {
        if (CordovaIosDeviceLauncher.nativeDebuggerProxyInstance) {
            CordovaIosDeviceLauncher.nativeDebuggerProxyInstance.kill('SIGHUP');
            CordovaIosDeviceLauncher.nativeDebuggerProxyInstance = null;
        }
        if (CordovaIosDeviceLauncher.webDebuggerProxyInstance) {
            CordovaIosDeviceLauncher.webDebuggerProxyInstance.kill();
            CordovaIosDeviceLauncher.webDebuggerProxyInstance = null;
        }
    }

    public static getBundleIdentifier(projectRoot: string): Q.Promise<string> {
        return Q.nfcall(fs.readdir, path.join(projectRoot, 'platforms', 'ios')).then((files: string[]) => {
            let xcodeprojfiles = files.filter((file: string) => /\.xcodeproj$/.test(file));
            if (xcodeprojfiles.length === 0) {
                throw new Error('Unable to find xcodeproj file');
            }
            let xcodeprojfile = xcodeprojfiles[0];
            let projectName = /^(.*)\.xcodeproj/.exec(xcodeprojfile)[1];
            let filepath = path.join(projectRoot, 'platforms', 'ios', projectName, projectName + '-Info.plist');
            let plist = pl.parse(fs.readFileSync(filepath, 'utf8'));
            return plist.CFBundleIdentifier;
        });
    }

    public static startWebkitDebugProxy(proxyPort: number, proxyRangeStart: number, proxyRangeEnd: number): Q.Promise<any> {
        if (CordovaIosDeviceLauncher.webDebuggerProxyInstance) {
            CordovaIosDeviceLauncher.webDebuggerProxyInstance.kill();
            CordovaIosDeviceLauncher.webDebuggerProxyInstance = null;
        }

        let deferred = Q.defer();
        let portRange = `null:${proxyPort},:${proxyRangeStart}-${proxyRangeEnd}`;
        CordovaIosDeviceLauncher.webDebuggerProxyInstance = child_process.spawn('ios_webkit_debug_proxy', ['-c', portRange]);
        CordovaIosDeviceLauncher.webDebuggerProxyInstance.on('error', function (err: Error) {
            deferred.reject(new Error('Unable to start ios_webkit_debug_proxy.'));
        });
        // Allow some time for the spawned process to error out
        Q.delay(250).then(() => deferred.resolve({}));

        return deferred.promise;
    }

    public static getPathOnDevice(packageId: string): Q.Promise<string> {
        return promiseExec('ideviceinstaller -l -o xml > /tmp/$$.ideviceinstaller && echo /tmp/$$.ideviceinstaller')
        .catch(function (err: any): any {
            if (err.code === 'ENOENT') {
                throw new Error('Unable to find ideviceinstaller.');
            }
            throw err;
        }).spread<string>(function (stdout: string, stderr: string): string {
            // First find the path of the app on the device
            let filename: string = stdout.trim();
            if (!/^\/tmp\/[0-9]+\.ideviceinstaller$/.test(filename)) {
                throw new Error('Unable to list installed applications on device');
            }

            let list: any[] = pl.parse(fs.readFileSync(filename, 'utf8'));
            fs.unlink(filename);
            for (let i: number = 0; i < list.length; ++i) {
                if (list[i].CFBundleIdentifier === packageId) {
                    let path: string = list[i].Path;
                    return path;
                }
            }

            throw new Error('Application not installed on the device');
        });
    }
}

process.on('exit', CordovaIosDeviceLauncher.cleanup);
