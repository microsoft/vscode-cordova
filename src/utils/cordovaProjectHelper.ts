/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as Q from 'q';

export class CordovaProjectHelper {
    private static PROJECT_TYPINGS_FOLDERNAME =  "typings";
    private static PROJECT_TYPINGS_PLUGINS_FOLDERNAME =  "plugins";
    private static PROJECT_TYPINGS_CORDOVA_FOLDERNAME =  "cordova";
    private static VSCODE_DIR: string = ".vscode";
    private static PLUGINS_FETCH_FILENAME: string = "fetch.json";
    private static CONFIG_XML_FILENAME: string = "config.xml";
    private static PROJECT_PLUGINS_DIR: string = "plugins";
    private static TSD_SETTINGS_JSON_FILE =  "tsd.json";


    /**
     *  Helper function to get the list of plugins installed for the project.
     */
    public static getInstalledPlugins(projectRoot: string): string[] {
        let fetchJsonPath: string = path.resolve(projectRoot, CordovaProjectHelper.PROJECT_PLUGINS_DIR, CordovaProjectHelper.PLUGINS_FETCH_FILENAME);

        if (!fs.existsSync(fetchJsonPath)) {
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
        while (fs.existsSync(projectRoot) && !fs.existsSync(path.join(projectRoot, CordovaProjectHelper.CONFIG_XML_FILENAME))) {
            // Navigate up one level until either taco.json is found or the parent path is invalid
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
        let targetPath: string;
        if (projectRoot) {
           targetPath = path.resolve(projectRoot, CordovaProjectHelper.VSCODE_DIR); 
           if(!fs.existsSync(targetPath)) {
               fs.mkdirSync(targetPath);
           }
           
           return targetPath;
        } else {
            return null;
        } 
    }
    
    /**
     *  Helper function to get the path of tsd.json file
     */
    public static getTsdJsonPath(projectRoot: string): string {
        return path.resolve(CordovaProjectHelper.getOrCreateTypingsTargetPath(projectRoot), CordovaProjectHelper.TSD_SETTINGS_JSON_FILE);
    }
    
    /**
     *  Helper function to get the path to the Cordova type definitions folder
     */
    public static getCordovaTypeDefsPath(projectRoot: string): string {
        return path.resolve(CordovaProjectHelper.getOrCreateTypingsTargetPath(projectRoot));
    }
    
    /**
     *  Helper function to get the path to the plugin type definitions folder
     */
    public static getCordovaPluginTypeDefsPath(projectRoot: string): string {
        return path.resolve(CordovaProjectHelper.getOrCreateTypingsTargetPath(projectRoot), CordovaProjectHelper.PROJECT_TYPINGS_FOLDERNAME, CordovaProjectHelper.PROJECT_TYPINGS_CORDOVA_FOLDERNAME, CordovaProjectHelper.PROJECT_TYPINGS_PLUGINS_FOLDERNAME);
    }
}
