// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.


import * as elementtree from 'elementtree';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as Q from 'q';

import {CordovaIosDeviceLauncher} from './cordovaIosDeviceLauncher';

import {cordovaRunCommand, execCommand} from './extension';

import {WebKitDebugAdapter} from '../../debugger/webkit/WebKitDebugAdapter';

import {CordovaProjectHelper} from '../utils/cordovaProjectHelper';

import {TelemetryHelper} from '../utils/telemetryHelper';

export class CordovaDebugAdapter extends WebKitDebugAdapter {
    private outputLogger: (message: string,  error?: boolean) => void;

    public constructor(outputLogger: (message: string,  error?: boolean) => void) {
        super();
        this.outputLogger = outputLogger;
    }

    public launch(launchArgs: ICordovaLaunchRequestArgs): Promise<void> {
        return new Promise<void>((resolve, reject) => TelemetryHelper.generate('launch', (generator) => {
            launchArgs.port = launchArgs.port || 9222;
            launchArgs.target = launchArgs.target || 'emulator';
            launchArgs.cwd = CordovaProjectHelper.getCordovaProjectRoot(launchArgs.cwd);

            let platform = launchArgs.platform && launchArgs.platform.toLowerCase();

            return TelemetryHelper.determineProjectTypes(launchArgs.cwd)
            .then((projectType) => generator.add('projectType', projectType, false))
            .then(() => {
                this.outputLogger(`Launching for ${platform} (This may take a while)...`);
                switch (platform) {
                case 'android':
                    generator.add('platform', platform, false);
                    return this.launchAndroid(launchArgs);
                case 'ios':
                    generator.add('platform', platform, false);
                    return this.launchIos(launchArgs);
                default:
                    generator.add('unknownPlatform', platform, true);
                    throw new Error(`Unknown Platform: ${platform}`);
                }
            }).then(() => {
                return this.attach(launchArgs);
            });
        }).done(resolve,reject));
    }

    public attach(attachArgs: ICordovaAttachRequestArgs): Promise<void> {
        return new Promise<void>((resolve, reject) => TelemetryHelper.generate('attach', (generator) => {
            attachArgs.port = attachArgs.port || 9222;
            attachArgs.target = attachArgs.target || 'emulator';
            attachArgs.cwd = CordovaProjectHelper.getCordovaProjectRoot(attachArgs.cwd);
            let platform = attachArgs.platform && attachArgs.platform.toLowerCase();

            return TelemetryHelper.determineProjectTypes(attachArgs.cwd).then((projectType) => generator.add('projectType', projectType, false)).then(() => {
                this.outputLogger(`Attaching to ${platform}`);
                switch (platform) {
                case 'android':
                    generator.add('platform', platform, false);
                    return this.attachAndroid(attachArgs);
                case 'ios':
                    generator.add('platform', platform, false);
                    return this.attachIos(attachArgs);
                default:
                    generator.add('unknownPlatform', platform, true);
                    throw new Error(`Unknown Platform: ${platform}`);
                }
            }).then((processedAttachArgs: IAttachRequestArgs & {url?: string}) => {
                this.outputLogger('Attaching to app.');
                this.outputLogger('', true); // Send blank message on stderr to include a divider between prelude and app starting
                return super.attach(processedAttachArgs, processedAttachArgs.url);
            });
        }).done(resolve, reject));
    }

    private launchAndroid(launchArgs: ICordovaLaunchRequestArgs): Q.Promise<void> {
        let workingDirectory = launchArgs.cwd;
        let errorLogger = (message) => this.outputLogger(message, true);
        // Launch the app
        let isDevice = launchArgs.target.toLowerCase() === 'device';
        let args = ['run', 'android',  isDevice ? '--device' : '--emulator', '--verbose'];
        if (['device', 'emulator'].indexOf(launchArgs.target.toLowerCase()) === -1) {
            args.push(`--target=${launchArgs.target}`);
        }
        let cordovaResult = cordovaRunCommand(args, errorLogger, workingDirectory).then((output) => {
            let runOutput = output[0];
            let stderr = output[1];
            let errorMatch = /(ERROR.*)/.exec(runOutput);
            if (errorMatch) {
                errorLogger(runOutput);
                errorLogger(stderr);
                throw new Error(`Error running android`);
            }
            this.outputLogger('App successfully launched');
        });

        return cordovaResult;
    }

    private attachAndroid(attachArgs: ICordovaAttachRequestArgs): Q.Promise<IAttachRequestArgs> {
        let errorLogger = (message) => this.outputLogger(message, true);
        // Determine which device/emulator we are targeting

        let adbDevicesResult = execCommand('adb', ['devices'], errorLogger)
        .then((devicesOutput) => {
            if (attachArgs.target.toLowerCase() === 'device') {
                let deviceMatch = /\n([^\t]+)\tdevice($|\n)/m.exec(devicesOutput.replace(/\r/g, ''));
                if (!deviceMatch) {
                    errorLogger(devicesOutput);
                    throw new Error('Unable to find device');
                }
                return deviceMatch[1];
            } else {
                let emulatorMatch = /\n(emulator[^\t]+)\tdevice($|\n)/m.exec(devicesOutput.replace(/\r/g, ''));
                if (!emulatorMatch) {
                    errorLogger(devicesOutput);
                    throw new Error('Unable to find emulator');
                }
                return emulatorMatch[1];
            }
        }, (err: Error): any => {
            let errorCode: string = (<any>err).code;
            if (errorCode && errorCode === 'ENOENT') {
                throw new Error('Unable to find adb. Please ensure it is in your PATH and re-open Visual Studio Code');
            }
            throw err;
        });
        let packagePromise = Q.nfcall(fs.readFile, path.join(attachArgs.cwd, 'platforms', 'android', 'AndroidManifest.xml')).then((manifestContents) => {
            let parsedFile = elementtree.XML(manifestContents.toString());
            let packageKey = 'package';
            return parsedFile.attrib[packageKey];
        });
        return Q.all([packagePromise, adbDevicesResult]).spread((appPackageName, targetDevice) => {
            let getPidCommandArguments = ['-s', targetDevice, 'shell', `ps | grep ${appPackageName}`];

            let findPidFunction = () => execCommand('adb', getPidCommandArguments, errorLogger).then((pidLine: string) => /^[^ ]+ +([^ ]+) /m.exec(pidLine));

            return CordovaDebugAdapter.retryAsync(findPidFunction, (match) => !!match,  5, 1, 5000, 'Unable to find pid of cordova app').then((match: RegExpExecArray) => match[1]).then((pid) => {
                // Configure port forwarding to the app
                let forwardSocketCommandArguments = ['-s', targetDevice, 'forward', `tcp:${attachArgs.port}`, `localabstract:webview_devtools_remote_${pid}`];
                this.outputLogger('Forwarding debug port');
                return execCommand('adb', forwardSocketCommandArguments, errorLogger);
            });
        }).then(() => {
            let args: IAttachRequestArgs = {port: attachArgs.port, webRoot: attachArgs.cwd, cwd: attachArgs.cwd };
            return args;
        });
    }

    private launchIos(launchArgs: ICordovaLaunchRequestArgs): Q.Promise<void> {
        if (os.platform() !== 'darwin') {
            return Q.reject<void>('Unable to launch iOS on non-mac machines');
        }
        let workingDirectory = launchArgs.cwd;
        let errorLogger = (message) => this.outputLogger(message, true);
        this.outputLogger('Launching app (This may take a while)...');

        let iosDebugProxyPort = launchArgs.iosDebugProxyPort || 9221;
        let appStepLaunchTimeout = launchArgs.appStepLaunchTimeout || 5000;
        // Launch the app
        if (launchArgs.target.toLowerCase() === 'device') {
            // cordova run ios does not terminate, so we do not know when to try and attach.
            // Instead, we try to launch manually using homebrew.
            return cordovaRunCommand(['build', 'ios',  '--device'], errorLogger, workingDirectory).then(() => {
                let buildFolder = path.join(workingDirectory, 'platforms', 'ios', 'build', 'device');

                this.outputLogger('Installing app on device');

                let installPromise = Q.nfcall(fs.readdir, buildFolder).then((files: string[]) => {
                    let ipaFiles = files.filter((file) => /\.ipa$/.test(file));
                    if (ipaFiles.length === 0) {
                        throw new Error('Unable to find an ipa to install');
                    }
                    let ipaFile = path.join(buildFolder, ipaFiles[0]);

                    return execCommand('ideviceinstaller', ['-i', ipaFile], errorLogger).catch((err: Error): any => {
                        let errorCode: string = (<any>err).code;
                        if (errorCode && errorCode === 'ENOENT') {
                            throw new Error('Unable to find ideviceinstaller. Please ensure it is in your PATH and re-open Visual Studio Code');
                        }
                        throw err;
                    });
                });

                return Q.all([CordovaIosDeviceLauncher.getBundleIdentifier(workingDirectory), installPromise]);
            }).spread((appBundleId) => {
                // App is now built and installed. Try to launch
                this.outputLogger('Launching app');
                return CordovaIosDeviceLauncher.startDebugProxy(iosDebugProxyPort).then(() => {
                    return CordovaIosDeviceLauncher.startApp(appBundleId, iosDebugProxyPort, appStepLaunchTimeout);
                });
            }).then(() => void(0));
        } else {
            let target = launchArgs.target.toLowerCase() === 'emulator' ? null : launchArgs.target;
            if (target) {
                return cordovaRunCommand(['emulate', 'ios', '--target=' + target], errorLogger, workingDirectory).catch((err) => {
                    return cordovaRunCommand(['emulate', 'ios', '--list'], errorLogger, workingDirectory).then((output) => {
                        // List out available targets
                        errorLogger('Unable to run with given target.');
                        errorLogger(output[0].replace(/\*+[^*]+\*+/g, '')); // Print out list of targets, without ** RUN SUCCEEDED **
                        throw err;
                    });
                }).then(() => void(0));
            } else {
                return cordovaRunCommand(['emulate', 'ios'], errorLogger, workingDirectory).then(() => void(0));
            }
        }
    }

    private attachIos(attachArgs: ICordovaAttachRequestArgs): Q.Promise<IAttachRequestArgs> {
        attachArgs.webkitRangeMin = attachArgs.webkitRangeMin || 9223;
        attachArgs.webkitRangeMax = attachArgs.webkitRangeMax || 9322;
        attachArgs.attachAttempts = attachArgs.attachAttempts || 5;
        attachArgs.attachDelay = attachArgs.attachDelay || 1000;
        // Start the tunnel through to the webkit debugger on the device
        this.outputLogger('Configuring debugging proxy');
        return CordovaIosDeviceLauncher.startWebkitDebugProxy(attachArgs.port, attachArgs.webkitRangeMin, attachArgs.webkitRangeMax).then(() => {
            if (attachArgs.target.toLowerCase() === 'device') {
                return CordovaIosDeviceLauncher.getBundleIdentifier(attachArgs.cwd).then(CordovaIosDeviceLauncher.getPathOnDevice);
            } else {
                return Q.nfcall(fs.readdir, path.join(attachArgs.cwd, 'platforms', 'ios', 'build', 'emulator')).then((entries: string[]) => {
                   let filtered = entries.filter((entry) => /\.app$/.test(entry));
                   if (filtered.length > 0) {
                       return filtered[0];
                   } else {
                       throw new Error('Unable to find .app file');
                   }
                });
            }
        }).then((packagePath) => {
            return this.promiseGet(`http://localhost:${attachArgs.port}/json`, 'Unable to communicate with ios_webkit_debug_proxy').then((response: string) => {
                try {
                    let endpointsList = JSON.parse(response);
                    let devices = endpointsList.filter((entry) =>
                        attachArgs.target.toLowerCase() === 'device' ? entry.deviceId !== 'SIMULATOR'
                                                                    : entry.deviceId === 'SIMULATOR'
                    );
                    let device = devices[0];
                    // device.url is of the form 'localhost:port'
                    return parseInt(device.url.split(':')[1], 10);
                } catch (e) {
                    throw new Error('Unable to find iOS target device/simulator');
                }
            }).then((targetPort) => {
                let findWebviewFunc = () => {
                    return this.promiseGet(`http://localhost:${targetPort}/json`, 'Unable to communicate with target')
                    .then((response: string) => {
                        try {
                            let webviewsList = JSON.parse(response);
                            return webviewsList.filter((entry) => entry.url.indexOf(packagePath) !== -1);
                        } catch (e) {
                            throw new Error('Unable to find target app');
                        }
                    });
                };

                return CordovaDebugAdapter.retryAsync(findWebviewFunc, (webviewList) => webviewList.length > 0, attachArgs.attachAttempts, 1, attachArgs.attachDelay, 'Unable to find webview')
                .then((relevantViews) => {
                    return {port: targetPort, url: relevantViews[0].url};
                });
            });
        }).then(({port, url}) => {
            return {port: port, webRoot: attachArgs.cwd, cwd: attachArgs.cwd, url: url};
        });
    }

    private static retryAsync<T>(func: () => Q.Promise<T>, condition: (result: T) => boolean, maxRetries: number, iteration: number, delay: number, failure: string): Q.Promise<T> {
        return func().then(result => {
            if (condition(result)) {
                return result;
            }

            if (iteration < maxRetries) {
                return Q.delay(delay).then(() => CordovaDebugAdapter.retryAsync(func, condition, maxRetries, iteration + 1, delay, failure));
            }

            throw new Error(failure);
        });
    }

    private promiseGet(url: string, reqErrMessage: string): Q.Promise<string> {
        let deferred = Q.defer<string>();
        let req = http.get(url, function (res) {
            let responseString = '';
            res.on('data', (data: Buffer) => {
                responseString += data.toString();
            });
            res.on('end', () => {
                deferred.resolve(responseString);
            });
        });
        req.on('error', (err: Error) => {
            this.outputLogger(reqErrMessage);
            deferred.reject(err);
        });
        return deferred.promise;
    }
}
