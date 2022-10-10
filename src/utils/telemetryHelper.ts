// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

/* tslint:disable:no-use-before-declare */
import { CordovaProjectHelper, IPluginDetails, ProjectType } from "./cordovaProjectHelper";
import * as fs from "fs";
import * as path from "path";
import { Telemetry } from "./telemetry";
import * as nls from "vscode-nls";
import { ErrorHelper } from "../common/error/errorHelper";
import { InternalErrorCode } from "../common/error/internalErrorCode";
nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();

export interface ITelemetryPropertyInfo {
    value: any;
    isPii: boolean;
}

export interface ICommandTelemetryProperties {
    [propertyName: string]: ITelemetryPropertyInfo;
}

export interface IExternalTelemetryProvider {
    sendTelemetry: (event: string, props: Telemetry.ITelemetryProperties, error?: Error) => void;
}

export interface ISimulateTelemetryProperties {
    platform?: string;
    target: string;
    port: number;
    simulatePort?: number;
    livereload?: boolean;
    livereloadDelay?: number;
    forcePrepare?: boolean;
}

interface IDictionary<T> {
    [key: string]: T;
}

interface IHasErrorCode {
    errorCode: number;
}

export abstract class TelemetryGeneratorBase {
    protected telemetryProperties: ICommandTelemetryProperties = {};
    private componentName: string;
    private currentStepStartTime: [number, number];
    private currentStep: string = "initialStep";
    private errorIndex: number = -1; // In case we have more than one error (We start at -1 because we increment it before using it)

    constructor(componentName: string) {
        this.componentName = componentName;
        this.currentStepStartTime = process.hrtime();
    }

    public add(baseName: string, value: any, isPii: boolean): TelemetryGeneratorBase {
        return this.addWithPiiEvaluator(baseName, value, () => isPii);
    }

    public addWithPiiEvaluator(
        baseName: string,
        value: any,
        piiEvaluator: { (value: string, name: string): boolean },
    ): TelemetryGeneratorBase {
        // We have 3 cases:
        //     * Object is an array, we add each element as baseNameNNN
        //     * Object is a hash, we add each element as baseName.KEY
        //     * Object is a value, we add the element as baseName
        try {
            if (Array.isArray(value)) {
                this.addArray(baseName, <any[]>value, piiEvaluator);
            } else if (!!value && (typeof value === "object" || typeof value === "function")) {
                this.addHash(baseName, <IDictionary<any>>value, piiEvaluator);
            } else {
                this.addString(baseName, String(value), piiEvaluator);
            }
        } catch (error) {
            // We don't want to crash the functionality if the telemetry fails.
            // This error message will be a javascript error message, so it's not pii
            this.addString(`telemetryGenerationError.${baseName}`, String(error), () => false);
        }

        return this;
    }

    public addError(error: Error): TelemetryGeneratorBase {
        this.add(`error.message${++this.errorIndex}`, error.message, true);
        const errorWithErrorCode: IHasErrorCode = <IHasErrorCode>(<Record<string, any>>error);
        if (errorWithErrorCode.errorCode) {
            this.add(`error.code${this.errorIndex}`, errorWithErrorCode.errorCode, false);
        }

        return this;
    }

    public time<T>(name: string, codeToMeasure: { (): Promise<T> }): Promise<T> {
        const startTime: [number, number] = process.hrtime();
        return codeToMeasure()
            .finally(() => this.finishTime(name, startTime))
            .catch((reason: any) => {
                this.addError(reason);
                throw reason;
            });
    }

    public step(name: string): TelemetryGeneratorBase {
        // First we finish measuring this step time, and we send a telemetry event for this step
        this.finishTime(this.currentStep, this.currentStepStartTime);
        this.sendCurrentStep();

        // Then we prepare to start gathering information about the next step
        this.currentStep = name;
        this.telemetryProperties = {};
        this.currentStepStartTime = process.hrtime();
        return this;
    }

    public send(): void {
        if (this.currentStep) {
            this.add("lastStepExecuted", this.currentStep, false);
        }

        this.step(null); // Send the last step
    }

    public getTelemetryProperties(): ICommandTelemetryProperties {
        return this.telemetryProperties;
    }

    protected abstract sendTelemetryEvent(telemetryEvent: Telemetry.TelemetryEvent): void;

    private sendCurrentStep(): void {
        this.add("step", this.currentStep, false);
        const telemetryEvent: Telemetry.TelemetryEvent = new Telemetry.TelemetryEvent(
            this.componentName,
        );
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        TelemetryHelper.addTelemetryEventProperties(telemetryEvent, this.telemetryProperties);
        this.sendTelemetryEvent(telemetryEvent);
    }

    private addArray(
        baseName: string,
        array: any[],
        piiEvaluator: { (value: string, name: string): boolean },
    ): void {
        // Object is an array, we add each element as baseNameNNN
        let elementIndex = 1; // We send telemetry properties in a one-based index
        array.forEach((element: any) =>
            this.addWithPiiEvaluator(baseName + elementIndex++, element, piiEvaluator),
        );
    }

    private addHash(
        baseName: string,
        hash: IDictionary<any>,
        piiEvaluator: { (value: string, name: string): boolean },
    ): void {
        // Object is a hash, we add each element as baseName.KEY
        Object.keys(hash).forEach((key: string) =>
            this.addWithPiiEvaluator(`${baseName}.${key}`, hash[key], piiEvaluator),
        );
    }

    private addString(
        name: string,
        value: string,
        piiEvaluator: { (value: string, name: string): boolean },
    ): void {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        this.telemetryProperties[name] = TelemetryHelper.telemetryProperty(
            value,
            piiEvaluator(value, name),
        );
    }

    private combine(...components: string[]): string {
        const nonNullComponents: string[] = components.filter(
            (component: string) => component !== null,
        );
        return nonNullComponents.join(".");
    }

    private finishTime(name: string, startTime: [number, number]): void {
        const endTime: [number, number] = process.hrtime(startTime);
        this.add(
            this.combine(name, "time"),
            String(endTime[0] * 1000 + endTime[1] / 1000000),
            false,
        );
    }
}

export class TelemetryGenerator extends TelemetryGeneratorBase {
    protected sendTelemetryEvent(telemetryEvent: Telemetry.TelemetryEvent): void {
        Telemetry.send(telemetryEvent);
    }
}

export class TelemetryHelper {
    public static createTelemetryEvent(eventName: string): Telemetry.TelemetryEvent {
        return new Telemetry.TelemetryEvent(eventName);
    }

    public static createTelemetryActivity(eventName: string): Telemetry.TelemetryActivity {
        return new Telemetry.TelemetryActivity(eventName);
    }

    public static determineProjectTypes(projectRoot: string): Promise<ProjectType> {
        const ionicMajorVersion = CordovaProjectHelper.determineIonicMajorVersion(projectRoot);
        const meteor = CordovaProjectHelper.exists(path.join(projectRoot, ".meteor"));
        const mobileFirst = CordovaProjectHelper.exists(path.join(projectRoot, ".project"));
        const phonegap = CordovaProjectHelper.exists(
            path.join(projectRoot, "www", "res", ".pgbomit"),
        );
        const cordova = CordovaProjectHelper.exists(path.join(projectRoot, "config.xml"));
        return Promise.all([meteor, mobileFirst, phonegap, cordova]).then(
            ([isMeteor, isMobileFirst, isPhonegap, isCordova]) =>
                new ProjectType(isMeteor, isMobileFirst, isPhonegap, isCordova, ionicMajorVersion),
        );
    }

    public static prepareProjectTypesTelemetry(projectType: ProjectType): Partial<ProjectType> {
        const relevantProjectTypes: Partial<ProjectType> = Object.entries(projectType).reduce(
            (relProjType, [key, val]) => {
                // We should send only relevant project types and skip all the rest.
                // Relevant types have the true boolean value
                if (val) {
                    relProjType[key] = val;
                }
                return relProjType;
            },
            {},
        );

        if (relevantProjectTypes.ionicMajorVersion) {
            relevantProjectTypes[`isIonic${relevantProjectTypes.ionicMajorVersion}`] = true;
            delete relevantProjectTypes.ionicMajorVersion;
        }

        return relevantProjectTypes;
    }

    public static telemetryProperty(propertyValue: any, pii?: boolean): ITelemetryPropertyInfo {
        return { value: String(propertyValue), isPii: pii || false };
    }

    public static addTelemetryEventProperties(
        event: Telemetry.TelemetryEvent,
        properties: ICommandTelemetryProperties,
    ): void {
        if (!properties) {
            return;
        }

        Object.keys(properties).forEach(function (propertyName: string): void {
            TelemetryHelper.addTelemetryEventProperty(
                event,
                propertyName,
                properties[propertyName].value,
                properties[propertyName].isPii,
            );
        });
    }

    public static addTelemetryEventProperty(
        event: Telemetry.TelemetryEvent,
        propertyName: string,
        propertyValue: any,
        isPii: boolean,
    ): void {
        if (Array.isArray(propertyValue)) {
            TelemetryHelper.addMultiValuedTelemetryEventProperty(
                event,
                propertyName,
                propertyValue,
                isPii,
            );
        } else {
            TelemetryHelper.setTelemetryEventProperty(event, propertyName, propertyValue, isPii);
        }
    }

    public static generate<T>(
        name: string,
        codeGeneratingTelemetry: { (telemetry: TelemetryGenerator): Promise<T> },
    ): Promise<T> {
        const generator: TelemetryGenerator = new TelemetryGenerator(name);
        return generator
            .time(null, () => codeGeneratingTelemetry(generator))
            .finally(() => generator.send());
    }

    public static sendPluginsList(projectRoot: string, pluginsList: string[]): void {
        // Load list of previously sent plugins = previousPlugins
        const pluginFilePath = path.join(projectRoot, ".vscode", "plugins.json");
        let pluginFileJson: any;

        if (CordovaProjectHelper.existsSync(pluginFilePath)) {
            try {
                const pluginFileJsonContents = fs.readFileSync(pluginFilePath, "utf8").toString();
                pluginFileJson = JSON.parse(pluginFileJsonContents);
            } catch (error) {
                console.error(error);
            }
        }

        // Get list of plugins in pluginsList but not in previousPlugins
        let pluginsFileList: string[] = new Array<string>();
        if (pluginFileJson && pluginFileJson.plugins) {
            pluginsFileList = pluginFileJson.plugins;
        } else {
            pluginFileJson = new Object();
        }

        const newPlugins: string[] = new Array<string>();
        pluginsList.forEach(plugin => {
            if (pluginsFileList.indexOf(plugin) < 0) {
                newPlugins.push(plugin);
                pluginsFileList.push(plugin);
            }
        });

        // If none, return
        if (newPlugins.length === 0) {
            return;
        }

        // Send telemetry event with list of new plugins
        const pluginDetails: IPluginDetails[] = newPlugins
            .map(pluginName =>
                CordovaProjectHelper.getInstalledPluginDetails(projectRoot, pluginName),
            )
            .filter(detail => !!detail);

        const pluginEvent = new Telemetry.TelemetryEvent("plugins", {
            plugins: JSON.stringify(pluginDetails),
        });
        Telemetry.send(pluginEvent);

        // Write out new list of previousPlugins
        pluginFileJson.plugins = pluginsFileList;
        try {
            fs.writeFileSync(pluginFilePath, JSON.stringify(pluginFileJson));
        } catch (err) {
            throw ErrorHelper.getNestedError(
                err.message,
                InternalErrorCode.CWDCouldNotReferToTheWorkspaceRootDirectory,
            );
        }
    }

    private static setTelemetryEventProperty(
        event: Telemetry.TelemetryEvent,
        propertyName: string,
        propertyValue: string,
        isPii: boolean,
    ): void {
        if (isPii) {
            event.setPiiProperty(propertyName, String(propertyValue));
        } else {
            event.properties[propertyName] = String(propertyValue);
        }
    }

    private static addMultiValuedTelemetryEventProperty(
        event: Telemetry.TelemetryEvent,
        propertyName: string,
        propertyValue: string[],
        isPii: boolean,
    ): void {
        for (let i: number = 0; i < propertyValue.length; i++) {
            TelemetryHelper.setTelemetryEventProperty(
                event,
                propertyName + i,
                propertyValue[i],
                isPii,
            );
        }
    }

    public static addTelemetryEventErrorProperty(
        event: Telemetry.TelemetryEvent,
        error: Error,
        errorDescription?: string,
        errorPropPrefix: string = "",
    ): void {
        const errorWithErrorCode: IHasErrorCode = <IHasErrorCode>(<Record<string, any>>error);
        if (errorWithErrorCode.errorCode) {
            this.addTelemetryEventProperty(
                event,
                `${errorPropPrefix}error.code`,
                errorWithErrorCode.errorCode,
                false,
            );
            if (errorDescription) {
                this.addTelemetryEventProperty(
                    event,
                    `${errorPropPrefix}error.message`,
                    errorDescription,
                    false,
                );
            }
        } else {
            this.addTelemetryEventProperty(
                event,
                `${errorPropPrefix}error.code`,
                InternalErrorCode.UnknownError,
                false,
            );
        }
    }

    public static sendErrorEvent(eventName: string, error: Error, errorDescription?: string): void {
        const event = TelemetryHelper.createTelemetryEvent(eventName);
        TelemetryHelper.addTelemetryEventErrorProperty(event, error, errorDescription, "");
        Telemetry.send(event);
    }
}

/* tslint:enable */
