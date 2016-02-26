// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as child_process from 'child_process';
import * as Q from 'q';
import * as os from 'os';
import * as util from 'util';
import {window} from 'vscode';

import {TelemetryHelper} from './telemetryHelper';

export class CordovaCommandHelper {
    private static CORDOVA_CMD_NAME = os.platform() === "darwin" ? "cordova" : "cordova.cmd";
    private static IONIC_CMD_NAME = os.platform() === "darwin" ? "ionic" : "ionic.cmd";
    private static CORDOVA_TELEMETRY_EVENT_NAME: string = "cordovaCommand";
    private static IONIC_TELEMETRY_EVENT_NAME: string = "ionicCommand";
    private static CORDOVA_DISPLAY_NAME: string = "Cordova";
    private static IONIC_DISPLAY_NAME: string = "Ionic";

    public static executeCordovaCommand(projectRoot: string, command: string, useIonic: boolean = false) {
        var telemetryEventName: string = CordovaCommandHelper.CORDOVA_TELEMETRY_EVENT_NAME;
        var cliCommandName: string = CordovaCommandHelper.CORDOVA_CMD_NAME;
        var cliDisplayName: string = CordovaCommandHelper.CORDOVA_DISPLAY_NAME;

        if (useIonic) {
            telemetryEventName = CordovaCommandHelper.IONIC_TELEMETRY_EVENT_NAME;
            cliCommandName = CordovaCommandHelper.IONIC_CMD_NAME;
            cliDisplayName = CordovaCommandHelper.IONIC_DISPLAY_NAME;
        }

        TelemetryHelper.generate(telemetryEventName, (generator) => {
            generator.add('command', command, false);
            let outputChannel = window.createOutputChannel("cordova");
            let commandToExecute = cliCommandName + " " + command;
            outputChannel.appendLine("########### EXECUTING: " + commandToExecute + " ###########");
            outputChannel.show();
            let process = child_process.exec(commandToExecute, { cwd: projectRoot });

            let deferred = Q.defer();
            process.on("error", (err: any) => {
                // ENOENT error will be thrown if no Cordova.cmd or ionic.cmd is found
                if (err.code === "ENOENT") {
                    window.showErrorMessage(util.format("%s not found, please run 'npm install –g %s' to install %s globally", cliDisplayName, cliDisplayName.toLowerCase(), cliDisplayName));
                }
                deferred.reject(err);
            });

            process.stderr.on('data', (data: any) => {
                outputChannel.append(data);
            });

            process.stdout.on('data', (data: any) => {
                outputChannel.append(data);
            });

            process.stdout.on("close", (exitCode: number) => {
                outputChannel.appendLine("########### FINISHED EXECUTING : " + commandToExecute + " ###########");
                deferred.resolve({});
            });

            return TelemetryHelper.determineProjectTypes(projectRoot)
                .then((projectType) => generator.add('projectType', projectType, false))
                .then(() => deferred.promise);
        });
    }
}
