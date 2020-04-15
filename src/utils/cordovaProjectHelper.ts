// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as Q from "q";
import * as semver from "semver";
import * as os from "os";

export interface IProjectType extends IIonicVersion {
    isMeteor: boolean;
    isMobilefirst: boolean;
    isPhonegap: boolean;
    isCordova: boolean;
}

export interface IIonicVersion {
    isIonic1: boolean;
    isIonic2: boolean;
    isIonic3: boolean;
    isIonic4: boolean;
    isIonic5: boolean;
}

export interface IPluginDetails {
    PluginId: string;
    PluginType: string;
    Version: string;
}

export class CordovaProjectHelper {
    private static PROJECT_TYPINGS_FOLDERNAME = "typings";
    private static PROJECT_TYPINGS_PLUGINS_FOLDERNAME = "plugins";
    private static PROJECT_TYPINGS_CORDOVA_FOLDERNAME = "cordova";
    private static PROJECT_TYPINGS_CORDOVA_IONIC_FOLDERNAME = "cordova-ionic";
    private static VSCODE_DIR: string = ".vscode";
    private static PLATFORMS_PATH: string = "platforms";
    private static PLUGINS_FETCH_FILENAME: string = "fetch.json";
    private static CONFIG_XML_FILENAME: string = "config.xml";
    private static PROJECT_PLUGINS_DIR: string = "plugins";
    private static IONIC_PROJECT_FILE: string = "ionic.project";

    private static CONFIG_IONIC_FILENAME: string = "ionic.config.json";
    private static IONIC_LIB_DEFAULT_PATH: string = path.join("www", "lib", "ionic");

    private static CORE_PLUGIN_LIST: string[] = ["cordova-plugin-battery-status",
                                                "cordova-plugin-camera",
                                                "cordova-plugin-console",
                                                "cordova-plugin-contacts",
                                                "cordova-plugin-device",
                                                "cordova-plugin-device-motion",
                                                "cordova-plugin-device-orientation",
                                                "cordova-plugin-dialogs",
                                                "cordova-plugin-file",
                                                "cordova-plugin-file-transfer",
                                                "cordova-plugin-geolocation",
                                                "cordova-plugin-globalization",
                                                "cordova-plugin-inappbrowser",
                                                "cordova-plugin-media",
                                                "cordova-plugin-media-capture",
                                                "cordova-plugin-network-information",
                                                "cordova-plugin-splashscreen",
                                                "cordova-plugin-statusbar",
                                                "cordova-plugin-vibration",
                                                "cordova-plugin-ms-azure-mobile-apps",
                                                "cordova-plugin-hockeyapp",
                                                "cordova-plugin-code-push",
                                                "cordova-plugin-bluetoothle",
                                                "phonegap-plugin-push",
                                                "cordova-plugin-ms-azure-mobile-engagement",
                                                "cordova-plugin-whitelist",
                                                "cordova-plugin-crosswalk-webview",
                                                "cordova-plugin-ms-adal",
                                                "com-intel-security-cordova-plugin",
                                                "cordova-sqlite-storage",
                                                "cordova-plugin-ms-intune-mam" ];

    /**
     *  Helper function check if a file exists.
     */
    public static existsSync(path: string): boolean {
        try {
            // Attempt to get the file stats
            fs.statSync(path);
            return true;
        } catch (error) {
            return false;
        }
    }


    /**
     *  Helper (synchronous) function to create a directory recursively
     */
    public static makeDirectoryRecursive(dirPath: string): void {
        let parentPath = path.dirname(dirPath);
        if (!CordovaProjectHelper.existsSync(parentPath)) {
            CordovaProjectHelper.makeDirectoryRecursive(parentPath);
        }

        fs.mkdirSync(dirPath);
    }

    /**
     *  Helper (synchronous) function to delete a directory recursively
     */
    public static deleteDirectoryRecursive(dirPath: string) {
        if (fs.existsSync(dirPath)) {
            if (fs.lstatSync(dirPath).isDirectory()) {
                fs.readdirSync(dirPath).forEach(function (file) {
                    let curPath = path.join(dirPath, file);
                    CordovaProjectHelper.deleteDirectoryRecursive(curPath);
                });

                fs.rmdirSync(dirPath);
            } else {
                fs.unlinkSync(dirPath);
            }
        }
    }

    /**
     *  Helper function to asynchronously copy a file
     */
    public static copyFile(from: string, to: string, encoding?: string): Q.Promise<any> {
        let deferred: Q.Deferred<any> = Q.defer();
        let destFile: fs.WriteStream = fs.createWriteStream(to, { encoding: encoding });
        let srcFile: fs.ReadStream = fs.createReadStream(from, { encoding: encoding });
        destFile.on("finish", function (): void {
            deferred.resolve({});
        });

        destFile.on("error", function (e: Error): void {
            deferred.reject(e);
        });

        srcFile.on("error", function (e: Error): void {
            deferred.reject(e);
        });

        srcFile.pipe(destFile);
        return deferred.promise;
    }

    /**
     *  Helper function to get the list of plugins installed for the project.
     */
    public static getInstalledPlugins(projectRoot: string): string[] {
        let fetchJsonPath: string = path.resolve(projectRoot, CordovaProjectHelper.PROJECT_PLUGINS_DIR, CordovaProjectHelper.PLUGINS_FETCH_FILENAME);

        if (!CordovaProjectHelper.existsSync(fetchJsonPath)) {
            return [];
        }

        try {
            let fetchJsonContents = fs.readFileSync(fetchJsonPath, "utf8");
            let fetchJson = JSON.parse(fetchJsonContents);
            return Object.keys(fetchJson);
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    /**
     *  Helper function to get the list of platforms installed for the project.
     */
    public static getInstalledPlatforms(projectRoot: string): string[] {
        let platformsPath: string = path.resolve(projectRoot,  CordovaProjectHelper.PLATFORMS_PATH);

        if (!CordovaProjectHelper.existsSync(platformsPath)) {
            return [];
        }

        try {
            let platformsDirContents = fs.readdirSync(platformsPath);
            return platformsDirContents.filter((platform) => {
                return platform.charAt(0) !== ".";
            });
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    public static getInstalledPluginDetails(projectRoot: string, pluginId: string): IPluginDetails {
        let packageJsonPath: string = path.resolve(projectRoot, CordovaProjectHelper.PROJECT_PLUGINS_DIR, pluginId, "package.json");

        if (!CordovaProjectHelper.existsSync(packageJsonPath)) {
            return null;
        }

        try {
            let packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

            let details: IPluginDetails = {
                PluginId: packageJson.name,
                Version: packageJson.version,
                PluginType: CordovaProjectHelper.CORE_PLUGIN_LIST.indexOf(pluginId) >= 0 ? "Core" : "Npm",
            };

            return details;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    /**
     *  Helper to find the root of the Cordova project. Returns null in the case of directories which are
     *  not cordova-based projects. Otherwise, returns the project root path as a string.
     */
    public static getCordovaProjectRoot(workspaceRoot: string): string {
        let parentPath: string;
        let projectRoot: string = workspaceRoot;
        let atFsRoot: boolean = false;

        while (!CordovaProjectHelper.existsSync(path.join(projectRoot, CordovaProjectHelper.CONFIG_XML_FILENAME))
            && !CordovaProjectHelper.existsSync(path.join(projectRoot, CordovaProjectHelper.CONFIG_IONIC_FILENAME))) {
            // Navigate up one level until either config.xml is found
            parentPath = path.resolve(projectRoot, "..");
            if (parentPath !== projectRoot) {
                projectRoot = parentPath;
            } else {
                // we have reached the filesystem root
                atFsRoot = true;
                break;
            }
        }

        if (atFsRoot) {
            // We reached the fs root, so the project path passed was not a Cordova-based project directory
            return null;
        }

        return projectRoot;
    }

    /**
     *  Helper function to get the target path for the type definition files (to be used for Cordova plugin intellisense).
     *  Creates the target path if it does not exist already.
     */
    public static getOrCreateTypingsTargetPath(projectRoot: string): string {
        if (projectRoot) {
            let targetPath = path.resolve(projectRoot, CordovaProjectHelper.VSCODE_DIR, CordovaProjectHelper.PROJECT_TYPINGS_FOLDERNAME);
            if (!CordovaProjectHelper.existsSync(targetPath)) {
                CordovaProjectHelper.makeDirectoryRecursive(targetPath);
            }

            return targetPath;
        }

        return null;
    }

    /**
     *  Helper function to get the path to Cordova plugin type definitions folder
     */
    public static getCordovaPluginTypeDefsPath(projectRoot: string): string {
        return path.resolve(CordovaProjectHelper.getOrCreateTypingsTargetPath(projectRoot), CordovaProjectHelper.PROJECT_TYPINGS_CORDOVA_FOLDERNAME, CordovaProjectHelper.PROJECT_TYPINGS_PLUGINS_FOLDERNAME);
    }

    /**
     *  Helper function to get the path to Ionic plugin type definitions folder
     */
    public static getIonicPluginTypeDefsPath(projectRoot: string): string {
        return path.resolve(CordovaProjectHelper.getOrCreateTypingsTargetPath(projectRoot), CordovaProjectHelper.PROJECT_TYPINGS_CORDOVA_IONIC_FOLDERNAME, CordovaProjectHelper.PROJECT_TYPINGS_PLUGINS_FOLDERNAME);
    }

    /**
     * Helper function to determine whether the project is an project or not
     */
    public static isIonicAngularProject(projectRoot: string): boolean {
        const versions = this.checkIonicVersions(projectRoot);
        return versions.isIonic1
            || versions.isIonic2
            || versions.isIonic3
            || versions.isIonic4
            || versions.isIonic5;
    }

    /**
     * Helper function to determine whether the project is an project or not by project types
     */
    public static isIonicAngularProjectByProjectType(projectType: IProjectType): boolean {
        return projectType.isIonic1
            || projectType.isIonic2
            || projectType.isIonic3
            || projectType.isIonic4
            || projectType.isIonic5;
    }

    /**
     * Helper function to determine which version of Ionic the project belongs to
     */
    public static checkIonicVersions(projectRoot: string): IIonicVersion {
        let versions: IIonicVersion = {
            isIonic1: false,
            isIonic2: false,
            isIonic3: false,
            isIonic4: false,
            isIonic5: false,
        };

        // Ionic 1 check
        // First look for "ionic.project" at the project root
        if (fs.existsSync(path.join(projectRoot, CordovaProjectHelper.IONIC_PROJECT_FILE))) {
            versions.isIonic1 = true;
        } else {
            // If not found, fall back to looking for "www/lib/ionic" folder. This isn't a 100% guarantee though: an Ionic project doesn't necessarily have an "ionic.project" and could have the Ionic lib
            // files in a non-default location
            versions.isIonic1 = fs.existsSync(path.join(projectRoot, CordovaProjectHelper.IONIC_LIB_DEFAULT_PATH));
        }

        const packageJsonPath = path.join(projectRoot, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
            return versions;
        }
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        const dependencies = packageJson.dependencies || {};
        const devDependencies = packageJson.devDependencies || {};

        // Ionic 2 & 3 check
        const highestNotSupportedIonic2BetaVersion = "2.0.0-beta.9";
        const highestNotSupportedIonic3BetaVersion = "3.0.0-beta.3";
        if ((dependencies["ionic-angular"]) && (devDependencies["@ionic/app-scripts"] || dependencies["@ionic/app-scripts"])) {
            const ionicVersion = dependencies["ionic-angular"];

            // If it's a valid version let's check it's greater than highest not supported Ionic major version beta
            if (semver.valid(ionicVersion)) {
                versions.isIonic2 = (semver.gt(ionicVersion, highestNotSupportedIonic2BetaVersion)
                    && semver.lt(ionicVersion, "3.0.0"));
                versions.isIonic3 = (semver.gt(ionicVersion, highestNotSupportedIonic3BetaVersion));
            }

            // If it's a valid range we check that the entire range is greater than highest not supported Ionic major version beta
            if (semver.validRange(ionicVersion)) {
                versions.isIonic2 = (semver.ltr(highestNotSupportedIonic2BetaVersion, ionicVersion)
                    && semver.gtr("3.0.0", ionicVersion));
                versions.isIonic3 = semver.ltr(highestNotSupportedIonic3BetaVersion, ionicVersion);
            }
        }

        // Ionic 4 & 5 check
        const highestNotSupportedIonic4BetaVersion = "4.0.0-beta.19";
        const highestNotSupportedIonic5BetaVersion = "5.0.0-beta.6";

        if ((dependencies["@ionic/angular"]) && (devDependencies["@ionic-native/core"] || dependencies["@ionic-native/core"])) {
            const ionicVersion = dependencies["@ionic/angular"];

            // If it's a valid version let's check it's greater than highest not supported Ionic major version beta
            if (semver.valid(ionicVersion)) {
                versions.isIonic4 = (semver.gt(ionicVersion, highestNotSupportedIonic4BetaVersion)
                    && semver.lt(ionicVersion, "5.0.0"));
                versions.isIonic5 = (semver.gt(ionicVersion, highestNotSupportedIonic5BetaVersion));
            }

            // If it's a valid range we check that the entire range is greater than highest not supported Ionic major version beta
            if (semver.validRange(ionicVersion)) {
                versions.isIonic4 = (semver.ltr(highestNotSupportedIonic4BetaVersion, ionicVersion)
                    && semver.gtr("5.0.0", ionicVersion));
                versions.isIonic5 = semver.ltr(highestNotSupportedIonic5BetaVersion, ionicVersion);
            }
        }
        return versions;
    }

    /**
     * Helper function to determine whether the project has a tsconfig.json
     * manifest and can be considered as a typescript project.
     */
    public static isTypescriptProject(projectRoot: string): boolean {
        return fs.existsSync(path.resolve(projectRoot, "tsconfig.json"));
    }

    public static getCliCommand(fsPath: string) {
        const cliName = CordovaProjectHelper.isIonicAngularProject(fsPath) ? "ionic" : "cordova";
        const commandExtension = os.platform() === "win32" ? ".cmd" : "";
        const command = cliName + commandExtension;
        return command;
    }

    public static getIonicCliVersion(fsPath: string, command: string = CordovaProjectHelper.getCliCommand(fsPath)): string {
        const ionicInfo = child_process.spawnSync(command, ["-v", "--quiet"], {
            cwd: fsPath,
            env: {
                ...process.env,
                CI: "Hack to disable Ionic autoupdate prompt",
            },
        });
        let parseVersion = /\d+\.\d+\.\d+/.exec(ionicInfo.stdout.toString());
        return parseVersion[0].trim();
    }

    /**
     * Checks if ionic cli version is being used greater than specified version using semver.
     * @param fsPath directory to use for running command
     * @param version version to compare
     * @param command multiplatform command to use
     */
    public static isIonicCliVersionGte(fsPath: string, version: string, command: string = CordovaProjectHelper.getCliCommand(fsPath)): boolean {
        try {
            const ionicVersion = CordovaProjectHelper.getIonicCliVersion(fsPath, command);
            return semver.gte(ionicVersion, version);
        } catch (err) {
            console.error("Error while detecting Ionic CLI version", err);
        }
        return true;
    }

    public static isIonicCliVersionGte3(fsPath: string, command: string = CordovaProjectHelper.getCliCommand(fsPath)): boolean {
        return CordovaProjectHelper.isIonicCliVersionGte(fsPath, "3.0.0", command);
    }

    public static getEnvArgument(launchArgs): any {
        let args = {...launchArgs};
        let env = process.env;

        if (args.envFile) {
            let buffer = fs.readFileSync(args.envFile, "utf8");

            // Strip BOM
            if (buffer && buffer[0] === "\uFEFF") {
                buffer = buffer.substr(1);
            }

            buffer.split("\n").forEach((line: string) => {
                const r = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
                if (r !== null) {
                    const key = r[1];
                    if (!env[key]) {	// .env variables never overwrite existing variables
                        let value = r[2] || "";
                        if (value.length > 0 && value.charAt(0) === "\"" && value.charAt(value.length - 1) === "\"") {
                            value = value.replace(/\\n/gm, "\n");
                        }
                        env[key] = value.replace(/(^['"]|['"]$)/g, "");
                    }
                }
            });
        }

        if (args.env) {
            // launch config env vars overwrite .env vars
            for (let key in args.env) {
                if (args.env.hasOwnProperty(key)) {
                    env[key] = args.env[key];
                }
            }
        }

        return env;
    }
}
