// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as Q from 'q';

export class CordovaProjectHelper {
    private static PROJECT_TYPINGS_FOLDERNAME =  "typings";
    private static PROJECT_TYPINGS_PLUGINS_FOLDERNAME =  "plugins";
    private static PROJECT_TYPINGS_CORDOVA_FOLDERNAME =  "cordova";
    private static PROJECT_TYPINGS_CORDOVA_IONIC_FOLDERNAME =  "cordova-ionic";
    private static VSCODE_DIR: string = ".vscode";
    private static PLUGINS_FETCH_FILENAME: string = "fetch.json";
    private static CONFIG_XML_FILENAME: string = "config.xml";
    private static PROJECT_PLUGINS_DIR: string = "plugins";
    private static IONIC_PROJECT_FILE: string = "ionic.project";

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
        if(!CordovaProjectHelper.existsSync(parentPath)) {
            CordovaProjectHelper.makeDirectoryRecursive(parentPath);
        }

        fs.mkdirSync(dirPath)
    }

    /**
     *  Helper function to asynchronously copy a file
     */
    public static copyFile(from: string, to: string, encoding?: string): Q.Promise<any> {
        var deferred: Q.Deferred<any> = Q.defer();
        var destFile: fs.WriteStream = fs.createWriteStream(to, { encoding: encoding });
        var srcFile: fs.ReadStream = fs.createReadStream(from, { encoding: encoding });
        destFile.on("finish", function(): void {
            deferred.resolve({});
        });

        destFile.on("error", function(e: Error): void {
            deferred.reject(e);
        });

        srcFile.on("error", function(e: Error): void {
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
            let fetchJsonContents = fs.readFileSync(fetchJsonPath).toString();
            let fetchJson = JSON.parse(fetchJsonContents);
            return Object.keys(fetchJson);
        } catch (error) {
            console.error(error);
            return [];
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
        while (!CordovaProjectHelper.existsSync(path.join(projectRoot, CordovaProjectHelper.CONFIG_XML_FILENAME))) {
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
           if(!CordovaProjectHelper.existsSync(targetPath)) {
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
     *  Helper function to determine whether the project is an Ionic project or no
     */
    public static isIonicProject(projectRoot: string): boolean {
        return fs.existsSync(path.join(projectRoot, CordovaProjectHelper.IONIC_PROJECT_FILE));
    }
}
