// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.


import * as child_process from 'child_process';
import * as elementtree from 'elementtree';
import * as fs from 'fs';
import * as http from 'http';
import * as io from 'socket.io-client';
import * as messaging from '../common/extensionMessaging';
import * as os from 'os';
import * as path from 'path';
import * as Q from 'q';
import * as simulate from 'cordova-simulate';

import {DebugProtocol} from 'vscode-debugprotocol';
import {ChromeDebugAdapter, ChromeConnection, IAttachRequestArgs} from 'vscode-chrome-debug-core';
import * as Chrome from 'vscode-chrome-debug-core/lib/src/chrome/chromeDebugProtocol';
import {CordovaIosDeviceLauncher} from './cordovaIosDeviceLauncher';
import {cordovaRunCommand, cordovaStartCommand, execCommand, killChildProcess} from './extension';
import {CordovaPathTransformer} from './cordovaPathTransformer';
import {CordovaProjectHelper} from '../utils/cordovaProjectHelper';
import {ISimulateTelemetryProperties, TelemetryHelper, TelemetryGenerator} from '../utils/telemetryHelper';
import {IProjectType} from '../utils/cordovaProjectHelper';
import {settingsHome} from '../utils/settingsHelper';
import {Telemetry} from '../utils/telemetry';
import {SimulationInfo} from '../common/simulationInfo';

export interface ICordovaLaunchRequestArgs extends DebugProtocol.LaunchRequestArguments, ICordovaAttachRequestArgs {
    iosDebugProxyPort?: number;
    appStepLaunchTimeout?: number;

    // Ionic livereload properties
    ionicLiveReload?: boolean;
    devServerPort?: number;
    devServerAddress?: string;
    devServerTimeout?: number;

    // Chrome debug properties
    url?: string;
    userDataDir?: string;

    // Cordova-simulate properties
    simulatePort?: number;
    livereload?: boolean;
    forceprepare?: boolean;
    simulateTempDir?: string;
    corsproxy?: boolean;
}

export interface ICordovaAttachRequestArgs extends DebugProtocol.AttachRequestArguments, IAttachRequestArgs {
    cwd: string; /* Automatically set by VS Code to the currently opened folder */
    platform: string;
    target?: string;
    webkitRangeMin?: number;
    webkitRangeMax?: number;
    attachAttempts?: number;
    attachDelay?: number;
}

export class CordovaDebugAdapter extends ChromeDebugAdapter {
    private static CHROME_DATA_DIR = 'chrome_sandbox_dir'; // The directory to use for the sandboxed Chrome instance that gets launched to debug the app
    private static NO_LIVERELOAD_WARNING = 'Warning: Ionic live reload is currently only supported for Ionic 1 projects. Continuing deployment without Ionic live reload...';
    private static SIMULATE_TARGETS: string[] = ['chrome', 'chromium', 'edge', 'firefox', 'ie', 'opera', 'safari'];

    private outputLogger: (message: string, error?: boolean) => void;
    private adbPortForwardingInfo: { targetDevice: string, port: number };
    private ionicLivereloadProcess: child_process.ChildProcess;
    private ionicDevServerUrl: string;
    private cordovaPathTransformer: CordovaPathTransformer;
    private previousLaunchArgs: ICordovaLaunchRequestArgs;
    private previousAttachArgs: ICordovaAttachRequestArgs;
    private simulateDebugHost: SocketIOClient.Socket;
    private telemetryInitialized: boolean;

    public constructor(outputLogger: (message: string, error?: boolean) => void, cdvPathTransformer: CordovaPathTransformer, chromeConnection: ChromeConnection) {
        super(chromeConnection);
        this.outputLogger = outputLogger;
        this.cordovaPathTransformer = cdvPathTransformer;
        this.telemetryInitialized = false;
    }

    public launch(launchArgs: ICordovaLaunchRequestArgs): Promise<void> {
        this.previousLaunchArgs = launchArgs;

        return new Promise<void>((resolve, reject) => this.initializeTelemetry(launchArgs.cwd)
            .then(() => TelemetryHelper.generate('launch', (generator) => {
            launchArgs.port = launchArgs.port || 9222;
            launchArgs.target = launchArgs.target || (launchArgs.platform === 'browser' ? 'chrome' : 'emulator');
            launchArgs.cwd = CordovaProjectHelper.getCordovaProjectRoot(launchArgs.cwd);

            let platform = launchArgs.platform && launchArgs.platform.toLowerCase();

            return TelemetryHelper.determineProjectTypes(launchArgs.cwd)
                .then((projectType) => {
                    generator.add('projectType', projectType, false);
                    this.outputLogger(`Launching for ${platform} (This may take a while)...`);

                    switch (platform) {
                        case 'android':
                            /* tslint:disable:no-switch-case-fall-through */
                            generator.add('platform', platform, false);
                            if (this.isSimulateTarget(launchArgs.target)) {
                                return this.launchSimulate(launchArgs, projectType, generator);
                            } else {
                                return this.launchAndroid(launchArgs, projectType);
                            }
                        /* tslint:enable:no-switch-case-fall-through */
                        case 'ios':
                            /* tslint:disable:no-switch-case-fall-through */
                            generator.add('platform', platform, false);
                            if (this.isSimulateTarget(launchArgs.target)) {
                                return this.launchSimulate(launchArgs, projectType, generator);
                            } else {
                                return this.launchIos(launchArgs, projectType);
                            }
                        /* tslint:enable:no-switch-case-fall-through */
                        case 'serve':
                            generator.add('platform', platform, false);
                            return this.launchServe(launchArgs, projectType);
                        case 'browser':
                            generator.add('platform', platform, false);
                            return this.launchSimulate(launchArgs, projectType, generator);
                        default:
                            generator.add('unknownPlatform', platform, true);
                            throw new Error(`Unknown Platform: ${platform}`);
                    }
                }).catch((err) => {
                    this.outputLogger(err.message || err, true);

                    return this.cleanUp().then(() => {
                        throw err;
                    });
                }).then(() => {
                    // For the browser platforms, we call super.launch(), which already attaches. For other platforms, attach here
                    if (platform !== 'serve' && platform !== 'browser' && !this.isSimulateTarget(launchArgs.target)) {
                        return this.attach(launchArgs);
                    }
                });
        }).done(resolve, reject)));
    }

    public isSimulateTarget(target: string) {
        return CordovaDebugAdapter.SIMULATE_TARGETS.indexOf(target) > -1;
    }

    public attach(attachArgs: ICordovaAttachRequestArgs): Promise<void> {
        this.previousAttachArgs = attachArgs;

        return new Promise<void>((resolve, reject) => this.initializeTelemetry(attachArgs.cwd)
            .then(() => TelemetryHelper.generate('attach', (generator) => {
            attachArgs.port = attachArgs.port || 9222;
            attachArgs.target = attachArgs.target || 'emulator';
            attachArgs.cwd = CordovaProjectHelper.getCordovaProjectRoot(attachArgs.cwd);
            let platform = attachArgs.platform && attachArgs.platform.toLowerCase();

            return TelemetryHelper.determineProjectTypes(attachArgs.cwd)
                .then((projectType) => generator.add('projectType', projectType, false))
                .then(() => {
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
                }).then((processedAttachArgs: IAttachRequestArgs & { url?: string }) => {
                    this.outputLogger('Attaching to app.');
                    this.outputLogger('', true); // Send blank message on stderr to include a divider between prelude and app starting
                    return super.attach(processedAttachArgs);
                });
        }).catch((err) => {
            this.outputLogger(err.message || err, true);

            return this.cleanUp().then(() => {
                throw err;
            });
        }).done(resolve, reject)));
    }

    public disconnect(): Promise<void> {
        return super.disconnect().then(() => {
            return this.cleanUp();
        });
    }

    private launchAndroid(launchArgs: ICordovaLaunchRequestArgs, projectType: IProjectType): Q.Promise<void> {
        let workingDirectory = launchArgs.cwd;
        let errorLogger = (message) => this.outputLogger(message, true);

        // Prepare the command line args
        let isDevice = launchArgs.target.toLowerCase() === 'device';
        let args = ['run', 'android', isDevice ? '--device' : '--emulator', '--verbose'];
        if (['device', 'emulator'].indexOf(launchArgs.target.toLowerCase()) === -1) {
            args.push(`--target=${launchArgs.target}`);
        }

        // Verify if we are using Ionic livereload
        if (launchArgs.ionicLiveReload) {
            if (projectType.ionic || projectType.ionic2) {
                // Livereload is enabled, let Ionic do the launch
                args.push('--livereload');

                return this.startIonicDevServer(launchArgs, args).then(() => void 0);
            } else {
                this.outputLogger(CordovaDebugAdapter.NO_LIVERELOAD_WARNING);
            }
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

        let adbDevicesResult = this.runAdbCommand(['devices'], errorLogger)
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
        let packagePromise = Q.nfcall(fs.readFile, path.join(attachArgs.cwd, 'platforms', 'android', 'AndroidManifest.xml'))
            .then((manifestContents) => {
                let parsedFile = elementtree.XML(manifestContents.toString());
                let packageKey = 'package';
                return parsedFile.attrib[packageKey];
            });
        return Q.all([packagePromise, adbDevicesResult]).spread((appPackageName, targetDevice) => {
            let getPidCommandArguments = ['-s', targetDevice, 'shell', `ps | grep ${appPackageName}`];

            let findPidFunction = () => this.runAdbCommand(getPidCommandArguments, errorLogger).then((pidLine: string) => /^[^ ]+ +([^ ]+) /m.exec(pidLine));

            return CordovaDebugAdapter.retryAsync(findPidFunction, (match) => !!match, 5, 1, 5000, 'Unable to find pid of cordova app').then((match: RegExpExecArray) => match[1])
                .then((pid) => {
                    // Configure port forwarding to the app
                    let forwardSocketCommandArguments = ['-s', targetDevice, 'forward', `tcp:${attachArgs.port}`, `localabstract:webview_devtools_remote_${pid}`];
                    this.outputLogger('Forwarding debug port');
                    return this.runAdbCommand(forwardSocketCommandArguments, errorLogger).then(() => {
                        this.adbPortForwardingInfo = { targetDevice, port: attachArgs.port };
                    });
                });
        }).then(() => {
            let args: IAttachRequestArgs = { port: attachArgs.port, webRoot: attachArgs.cwd };
            return args;
        });
    }

    private launchIos(launchArgs: ICordovaLaunchRequestArgs, projectType: IProjectType): Q.Promise<void> {
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
            // Verify if we are using Ionic livereload
            if (launchArgs.ionicLiveReload) {
                if (projectType.ionic || projectType.ionic2) {
                    // Livereload is enabled, let Ionic do the launch
                    let ionicArgs = ['run', '--device', 'ios', '--livereload'];

                    return this.startIonicDevServer(launchArgs, ionicArgs).then(() => void 0);
                } else {
                    this.outputLogger(CordovaDebugAdapter.NO_LIVERELOAD_WARNING);
                }
            }

            // cordova run ios does not terminate, so we do not know when to try and attach.
            // Instead, we try to launch manually using homebrew.
            return cordovaRunCommand(['build', 'ios', '--device'], errorLogger, workingDirectory).then(() => {
                let buildFolder = path.join(workingDirectory, 'platforms', 'ios', 'build', 'device');

                this.outputLogger('Installing app on device');

                let installPromise = Q.nfcall(fs.readdir, buildFolder).then((files: string[]) => {
                    let ipaFiles = files.filter((file) => /\.ipa$/.test(file));

                    if (ipaFiles.length !== 0) {
                        return path.join(buildFolder, ipaFiles[0]);
                    }

                    // No .ipa was found, look for a .app to convert to .ipa using xcrun
                    let appFiles = files.filter((file) => /\.app$/.test(file));

                    if (appFiles.length === 0) {
                        throw new Error('Unable to find a .app or a .ipa to install');
                    }

                    let appFile = path.join(buildFolder, appFiles[0]);
                    let ipaFile = path.join(buildFolder, path.basename(appFile, path.extname(appFile)) + '.ipa'); // Convert [path]/foo.app to [path]/foo.ipa
                    let execArgs = ['-v', '-sdk', 'iphoneos', 'PackageApplication', `${appFile}`, '-o', `${ipaFile}`];

                    return execCommand('xcrun', execArgs, errorLogger).then(() => ipaFile).catch((err): string => {
                        throw new Error(`Error converting ${path.basename(appFile)} to .ipa`);
                    });
                }).then((ipaFile: string) => {
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
            }).then(() => void (0));
        } else {
            let target = launchArgs.target.toLowerCase() === 'emulator' ? null : launchArgs.target;
            let emulateArgs = ['emulate'];

            if (target) {
                emulateArgs.push('--target=' + target);
            }

            emulateArgs.push('ios');

            // Verify if we are using Ionic livereload
            if (launchArgs.ionicLiveReload) {
                if (projectType.ionic || projectType.ionic2) {
                    // Livereload is enabled, let Ionic do the launch
                    emulateArgs.push('--livereload');

                    return this.startIonicDevServer(launchArgs, emulateArgs).then(() => void 0);
                } else {
                    this.outputLogger(CordovaDebugAdapter.NO_LIVERELOAD_WARNING);
                }
            }

            return cordovaRunCommand(emulateArgs, errorLogger, workingDirectory).then(() => void 0).catch((err) => {
                if (target) {
                    return cordovaRunCommand(['emulate', 'ios', '--list'], errorLogger, workingDirectory).then((output) => {
                        // List out available targets
                        errorLogger('Unable to run with given target.');
                        errorLogger(output[0].replace(/\*+[^*]+\*+/g, '')); // Print out list of targets, without ** RUN SUCCEEDED **
                        throw err;
                    });
                }

                throw err;
            });
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
                return CordovaIosDeviceLauncher.getBundleIdentifier(attachArgs.cwd)
                    .then(CordovaIosDeviceLauncher.getPathOnDevice)
                    .then(path.basename);
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
                    throw new Error('Unable to find iOS target device/simulator. Try specifying a different "port" parameter in launch.json');
                }
            }).then((targetPort) => {
                let findWebviewFunc = () => {
                    return this.promiseGet(`http://localhost:${targetPort}/json`, 'Unable to communicate with target')
                        .then((response: string) => {
                            try {
                                let webviewsList = JSON.parse(response);
                                return webviewsList.filter((entry) => {
                                    if (this.ionicDevServerUrl) {
                                        return entry.url.indexOf(this.ionicDevServerUrl) === 0;
                                    } else {
                                        return entry.url.indexOf(encodeURIComponent(packagePath)) !== -1;
                                    }
                                });
                            } catch (e) {
                                throw new Error('Unable to find target app');
                            }
                        });
                };

                return CordovaDebugAdapter.retryAsync(findWebviewFunc, (webviewList) => webviewList.length > 0, attachArgs.attachAttempts, 1, attachArgs.attachDelay, 'Unable to find webview')
                    .then((relevantViews) => {
                        return { port: targetPort, url: relevantViews[0].url };
                    });
            });
        }).then(({port, url}) => {
            return { port: port, webRoot: attachArgs.cwd, cwd: attachArgs.cwd, url: url };
        });
    }

    private launchSimulate(launchArgs: ICordovaLaunchRequestArgs, projectType: IProjectType, generator: TelemetryGenerator): Q.Promise<any> {
        let simulateTelemetryPropts: ISimulateTelemetryProperties = {
            platform: launchArgs.platform,
            target: launchArgs.target,
            port: launchArgs.port,
            simulatePort: launchArgs.simulatePort
        };

        if (launchArgs.hasOwnProperty('livereload')) {
            simulateTelemetryPropts.livereload = launchArgs.livereload;
        }

        if (launchArgs.hasOwnProperty('forceprepare')) {
            simulateTelemetryPropts.forceprepare = launchArgs.forceprepare;
        }

        generator.add('simulateOptions', simulateTelemetryPropts, false);

        let messageSender = new messaging.ExtensionMessageSender(launchArgs.cwd);
        let simulateInfo: SimulationInfo;

        let getEditorsTelemetry = messageSender.sendMessage(messaging.ExtensionMessage.GET_VISIBLE_EDITORS_COUNT)
            .then((editorsCount) => {
                generator.add('visibleTextEditors', editorsCount, false);
            }).catch((e) => {
                this.outputLogger('Could not read the visible text editors. ' + this.getErrorMessage(e));
            });

        let launchSimulate = Q(void 0)
            .then(() => {
                let simulateOptions = this.convertLaunchArgsToSimulateArgs(launchArgs);
                return messageSender.sendMessage(messaging.ExtensionMessage.START_SIMULATE_SERVER, [simulateOptions, projectType]);
            }).then((simInfo: SimulationInfo) => {
                simulateInfo = simInfo;
                return this.connectSimulateDebugHost(simulateInfo);
            }).then(() => {
                return messageSender.sendMessage(messaging.ExtensionMessage.LAUNCH_SIM_HOST);
            }).then(() => {
                // Launch Chrome and attach
                launchArgs.url = simulateInfo.appHostUrl;
                launchArgs.userDataDir = path.join(settingsHome(), CordovaDebugAdapter.CHROME_DATA_DIR);
                this.outputLogger('Attaching to app');

                return super.launch(launchArgs);
            }).catch((e) => {
                this.outputLogger('An error occurred while attaching to the debugger. ' + this.getErrorMessage(e));
                throw e;
            }).then(() => void 0);

        return Q.all([launchSimulate, getEditorsTelemetry]);
    }

    private resetSimulateViewport(): Q.Promise<void> {
        let jsPromise = this._chromeConnection.emulation_clearDeviceMetricsOverride().then(() => {
            return this._chromeConnection.emulation_setEmulatedMedia('');
        }).then(() => {
            return this._chromeConnection.emulation_resetScrollAndPageScaleFactor();
        }).then(() => void 0);

        return Q(jsPromise);
    }

    private changeSimulateViewport(data: simulate.ResizeViewportData): Q.Promise<void> {
        let jsPromise = this._chromeConnection.emulation_setDeviceMetricsOverride({
            width: data.width,
            height: data.height,
            deviceScaleFactor: 0,
            mobile: true,
            fitWindow: true
        }).then(() => void 0);

        return Q(jsPromise);
    }

    private connectSimulateDebugHost(simulateInfo: SimulationInfo): Q.Promise<void> {
        // Connect debug-host to cordova-simulate
        let viewportResizeFailMessage = 'Viewport resizing failed. Please try again.';
        let simulateDeferred: Q.Deferred<void> = Q.defer<void>();

        let simulateConnectErrorHandler = (err: any): void => {
            this.outputLogger(`Error connecting to the simulated app.`);
            simulateDeferred.reject(err);
        };

        this.simulateDebugHost = io.connect(simulateInfo.urlRoot);
        this.simulateDebugHost.on('connect_error', simulateConnectErrorHandler);
        this.simulateDebugHost.on('connect_timeout', simulateConnectErrorHandler);
        this.simulateDebugHost.on('connect', () => {
            this.simulateDebugHost.on('resize-viewport', (data: simulate.ResizeViewportData) => {
                this.changeSimulateViewport(data).catch((err) => {
                    this.outputLogger(viewportResizeFailMessage, true);
                }).done();
            });
            this.simulateDebugHost.on('reset-viewport', () => {
                this.resetSimulateViewport().catch((err) => {
                    this.outputLogger(viewportResizeFailMessage, true);
                }).done();
            });
            this.simulateDebugHost.emit('register-debug-host', { handlers: ['reset-viewport', 'resize-viewport'] });
            simulateDeferred.resolve(void 0);
        });

        return simulateDeferred.promise;
    }

    private convertLaunchArgsToSimulateArgs(launchArgs: ICordovaLaunchRequestArgs): simulate.SimulateOptions {
        let result: simulate.SimulateOptions = {};

        result.platform = launchArgs.platform;
        result.target = launchArgs.target;
        result.port = launchArgs.simulatePort;
        result.livereload = launchArgs.livereload;
        result.forceprepare = launchArgs.forceprepare;
        result.simulationpath = launchArgs.simulateTempDir;
        result.corsproxy = launchArgs.corsproxy;

        return result;
    }

    private launchServe(launchArgs: ICordovaLaunchRequestArgs, projectType: IProjectType): Q.Promise<void> {
        let errorLogger = (message) => this.outputLogger(message, true);

        // Currently, "ionic serve" is only supported for Ionic projects
        if (!projectType.ionic && !projectType.ionic2) {
            let errorMessage = 'Serving to the browser is currently only supported for Ionic projects';

            errorLogger(errorMessage);

            return Q.reject<void>(new Error(errorMessage));
        }

        // Set up "ionic serve" args
        let ionicServeArgs: string[] = [
            'serve',
            '--nobrowser'
        ];

        if (!launchArgs.ionicLiveReload) {
            ionicServeArgs.push('--nolivereload');
        }

        // Deploy app to browser
        return Q(void 0).then(() => {
            return this.startIonicDevServer(launchArgs, ionicServeArgs);
        }).then((devServerUrl: string) => {
            // Prepare Chrome launch args
            launchArgs.url = devServerUrl;
            launchArgs.userDataDir = path.join(settingsHome(), CordovaDebugAdapter.CHROME_DATA_DIR);

            // Launch Chrome and attach
            this.outputLogger('Attaching to app');
            return super.launch(launchArgs);
        });
    }

    /**
     * Starts an Ionic livereload server ("serve" or "run / emulate --livereload"). Returns a promise fulfilled with the full URL to the server.
     */
    private startIonicDevServer(launchArgs: ICordovaLaunchRequestArgs, cliArgs: string[]): Q.Promise<string> {
        if (launchArgs.devServerAddress) {
            cliArgs.push('--address', launchArgs.devServerAddress);
        }

        if (launchArgs.hasOwnProperty('devServerPort')) {
            if (typeof launchArgs.devServerPort === 'number' && launchArgs.devServerPort >= 0 && launchArgs.devServerPort <= 65535) {
                cliArgs.push('--port', launchArgs.devServerPort.toString());
            } else {
                return Q.reject<string>(new Error('The value for "devServerPort" must be a number between 0 and 65535'));
            }
        }

        let isServe: boolean = cliArgs[0] === 'serve';
        let isIosDevice: boolean = cliArgs.indexOf('ios') !== -1 && cliArgs.indexOf('--device') !== -1;
        let iosDeviceAppReadyRegex: RegExp = /\(lldb\)\W+run\r?\nsuccess/;
        let appReadyRegex: RegExp = /Ionic server commands(?:.*\r?\n)*.*Ionic server commands/;
        let errorRegex: RegExp = /error:.*/i;
        let serverReady: boolean = false;
        let appReady: boolean = false;
        let serverReadyTimeout: number = launchArgs.devServerTimeout || 20000;
        let appReadyTimeout: number = 120000; // If we're not serving, the app needs to build and deploy (and potentially start the emulator), which can be very long
        let serverDeferred = Q.defer<void>();
        let appDeferred = Q.defer<void>();
        let serverOut: string = '';
        let serverErr: string = '';
        const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
        let getServerErrorMessage = (channel: string) => {
            let errorMatch = errorRegex.exec(channel);

            if (errorMatch) {
                return 'Error in the Ionic live reload server:' + os.EOL + errorMatch[0];
            }

            return null;
        };

        this.ionicLivereloadProcess = cordovaStartCommand(cliArgs, launchArgs.cwd);
        this.ionicLivereloadProcess.on('error', (err) => {
            if (err.code === 'ENOENT') {
                serverDeferred.reject(new Error('Ionic not found, please run \'npm install –g ionic\' to install it globally'));
            } else {
                serverDeferred.reject(err);
            }
        });
        this.ionicLivereloadProcess.on('exit', (() => {
            this.ionicLivereloadProcess = null;

            let exitMessage: string = 'The Ionic live reload server exited unexpectedly';
            let errorMsg = getServerErrorMessage(serverErr);

            if (errorMsg) {
                // The Ionic live reload server has an error; check if it is related to the devServerAddress to give a better message
                if (errorMsg.indexOf('getaddrinfo ENOTFOUND') !== -1 || errorMsg.indexOf('listen EADDRNOTAVAIL') !== -1) {
                    exitMessage += os.EOL + 'Invalid address: please provide a valid IP address or hostname for the "devServerAddress" property in launch.json';
                } else {
                    exitMessage += os.EOL + errorMsg;
                }
            }

            if (!serverDeferred.promise.isPending() && !appDeferred.promise.isPending()) {
                // We are already debugging; disconnect the session
                this.outputLogger(exitMessage, true);
                this.disconnect();
                throw new Error(exitMessage);
            } else {
                // The Ionic dev server wasn't ready yet, so reject its promises
                serverDeferred.reject(new Error(exitMessage));
                appDeferred.reject(new Error(exitMessage));
            }
        }).bind(this));

        let serverOutputHandler = (data: Buffer) => {
            serverOut += data.toString();

            // Listen for the server to be ready. We check for the "Ionic server commands" string to decide that.
            //
            // Exemple output of Ionic dev server:
            //
            // Running live reload server: undefined
            // Watching: 0=www/**/*, 1=!www/lib/**/*
            // Running dev server:  http://localhost:8100
            // Ionic server commands, enter:
            // restart or r to restart the client app from the root
            // goto or g and a url to have the app navigate to the given url
            // consolelogs or c to enable/disable console log output
            // serverlogs or s to enable/disable server log output
            // quit or q to shutdown the server and exit
            //
            // ionic $
            if (!serverReady && /Ionic server commands/.test(serverOut)) {
                serverReady = true;
                serverDeferred.resolve(void 0);
            }

            if (serverReady && !appReady) {
                // Now that the server is ready, listen for the app to be ready as well. For "serve", this is always true, because no build and deploy is involved. For "run" and "emulate", we need to
                // wait until we encounter the "Ionic server commands" string a second time. The reason for that is that the output of the server will be the same as above, plus the build output, and
                // finally the "Ionic server commands" part will be printed again at the very end. However, for iOS device, the server output is different and instead we need to look for:
                //
                // (lldb)     run
                // success
                let regex: RegExp = isIosDevice ? iosDeviceAppReadyRegex : appReadyRegex;

                if (isServe || regex.test(serverOut)) {
                    appReady = true;
                    appDeferred.resolve(void 0);
                }
            }

            if (/Address Selection:/.test(serverOut)) {
                // Ionic does not know which address to use for the dev server, and requires human interaction; error out and let the user know
                let errorMessage: string = 'Your machine has multiple network addresses. Please specify which one your device or emulator will use to communicate with the dev server by adding a "devServerAddress": "ADDRESS" property to .vscode/launch.json.';
                let addresses: string[] = [];
                let addressRegex = /(\d+\) .*)/gm;
                let match: string[] = addressRegex.exec(serverOut);

                while (match) {
                    addresses.push(match[1]);
                    match = addressRegex.exec(serverOut);
                }

                if (addresses) {
                    // Give the user the list of addresses that Ionic found
                    errorMessage += [' Available addresses:'].concat(addresses).join(os.EOL + ' ');
                }

                serverDeferred.reject(new Error(errorMessage));
            }

            let errorMsg = getServerErrorMessage(serverOut);

            if (errorMsg) {
                appDeferred.reject(new Error(errorMsg));
            }
        };

        this.ionicLivereloadProcess.stdout.on('data', serverOutputHandler);
        this.ionicLivereloadProcess.stderr.on('data', (data: Buffer) => {
            serverErr += data.toString();

            let errorMsg = getServerErrorMessage(serverErr);

            if (errorMsg) {
                appDeferred.reject(new Error(errorMsg));
            }
        });
        this.outputLogger(`Starting Ionic dev server (live reload: ${launchArgs.ionicLiveReload})`);

        return serverDeferred.promise.timeout(serverReadyTimeout, `Starting the Ionic dev server timed out (${serverReadyTimeout} ms)`).then(() => {
            this.outputLogger('Building and deploying app');

            return appDeferred.promise.timeout(appReadyTimeout, `Building and deploying the app timed out (${appReadyTimeout} ms)`);
        }).then(() => {
            // Find the dev server full URL
            let match: string[] = /Running dev server:.*(http:\/\/.*)/gm.exec(serverOut);

            if (!match || match.length < 2) {
                return Q.reject<string>(new Error('Unable to determine the Ionic dev server address, please try re-launching the debugger'));
            }

            // The dev server address is the captured group at index 1 of the match
            this.ionicDevServerUrl = match[1];

            // When ionic 2 cli is installed, output includes ansi characters for color coded output.
            this.ionicDevServerUrl = this.ionicDevServerUrl.replace(ansiRegex, '');
            return Q(this.ionicDevServerUrl);
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
        let req = http.get(url, function(res) {
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

    private cleanUp(): Q.Promise<void> {
        const errorLogger = (message) => this.outputLogger(message, true);

        // Clean up this session's attach and launch args
        this.previousLaunchArgs = null;
        this.previousAttachArgs = null;

        // Stop ADB port forwarding if necessary
        let adbPortPromise: Q.Promise<void>;

        if (this.adbPortForwardingInfo) {
            const adbForwardStopArgs =
                ['-s', this.adbPortForwardingInfo.targetDevice,
                    'forward',
                    '--remove', `tcp:${this.adbPortForwardingInfo.port}`];
            adbPortPromise = this.runAdbCommand(adbForwardStopArgs, errorLogger)
                .then(() => void 0);
        } else {
            adbPortPromise = Q<void>(void 0);
        }

        // Kill the Ionic dev server if necessary
        let killServePromise: Q.Promise<void>;

        if (this.ionicLivereloadProcess) {
            this.ionicLivereloadProcess.removeAllListeners('exit');
            killServePromise = killChildProcess(this.ionicLivereloadProcess, errorLogger).finally(() => {
                this.ionicLivereloadProcess = null;
            });
        } else {
            killServePromise = Q<void>(void 0);
        }

        // Clear the Ionic dev server URL if necessary
        if (this.ionicDevServerUrl) {
            this.ionicDevServerUrl = null;
        }

        // Close the simulate debug-host socket if necessary
        if (this.simulateDebugHost) {
            this.simulateDebugHost.close();
            this.simulateDebugHost = null;
        }

        // Wait on all the cleanups
        return Q.allSettled([adbPortPromise, killServePromise]).then(() => void 0);
    }

    protected onScriptParsed(script: Chrome.Debugger.Script): void {
        let sourceMapsEnabled = this.previousLaunchArgs && this.previousLaunchArgs.sourceMaps || this.previousAttachArgs && this.previousAttachArgs.sourceMaps;

        if (sourceMapsEnabled && !script.sourceMapURL && path.extname(script.url) === '.js') {
            // Browsers don't always report source maps for scripts, so even though no source map was reported for this script, parse it in case it has a sourceMappingUrl attribute.
            let clientPath = this.cordovaPathTransformer.getClientPath(script.url);

            if (clientPath) {
                let scriptContent = fs.readFileSync(clientPath).toString();
                let parsedSrcMapUrl = this.findSourceAttribute('sourceMappingURL', scriptContent);

                if (parsedSrcMapUrl) {
                    script.sourceMapURL = parsedSrcMapUrl;
                }
            }
        }

        super.onScriptParsed(script);
    }

    /**
     * Initializes telemetry.
     */
    private initializeTelemetry(projectRoot: string): Q.Promise<any> {
        if (!this.telemetryInitialized) {
            this.telemetryInitialized = true;
            let version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf-8')).version;
            // Enable telemetry, forced on for now.
            return Telemetry.init('cordova-tools-debug-adapter', version, { isExtensionProcess: false, projectRoot: projectRoot })
                .catch((e) => {
                    this.outputLogger('Could not initialize telemetry.' + e.message || e.error || e.data || e);
                });
        } else {
            return Q.resolve(void 0);
        }
    }

    /**
     * Searches the specified code text for an attribute comment. Supported forms are line or
     * block comments followed by # (or @, though this is deprecated):
     * //# attribute=..., /*# attribute=... * /, //@ attribute=..., and /*@ attribute=... * /
     * @param attribute Name of the attribute to find
     * @param codeContent Source code to search for attribute comment
     * @return The attribute's value, or null if not exactly one is found
     */
    private findSourceAttribute(attribute: string, codeContent: string): string {
        if (codeContent) {
            let prefixes = ['//#', '/*#', '//@', '/*@'];
            let findString: string;
            let index = -1;
            let endIndex = -1;

            // Use pound-sign definitions first, but fall back to at-sign
            // The last instance of the attribute comment takes precedence
            for (var i = 0; index < 0 && i < prefixes.length; i++) {
                findString = '\n' + prefixes[i] + ' ' + attribute + '=';
                index = codeContent.lastIndexOf(findString);
            }

            if (index >= 0) {
                if (index >= 0) {
                    if (findString.charAt(2) === '*') {
                        endIndex = codeContent.indexOf('*/', index + findString.length);
                    } else {
                        endIndex = codeContent.indexOf('\n', index + findString.length);
                    }

                    if (endIndex < 0) {
                        endIndex = codeContent.length;
                    }

                    return codeContent.substring(index + findString.length, endIndex).trim();
                }
            }

            return null;
        }
    }

    private runAdbCommand(args, errorLogger): Q.Promise<string> {
        const originalPath = process.env['PATH'];
        if (process.env['ANDROID_HOME']) {
            process.env['PATH'] += path.delimiter + path.join(process.env['ANDROID_HOME'], 'platform-tools');
        }
        return execCommand('adb', args, errorLogger).finally(() => {
            process.env['PATH'] = originalPath;
        });
    }

    private getErrorMessage(e: any): string {
        return e.message || e.error || e.data || e;
    }
}
