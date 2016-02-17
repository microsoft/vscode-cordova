// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from 'path';
import * as Q from 'q';
import {TelemetryHelper} from './telemetryHelper';
import {CordovaProjectHelper} from './cordovaProjectHelper';

export class TsdHelper {
   private static CORDOVA_TYPINGS_FOLDERNAME =  "CordovaTypings";
   private static CORDOVA_TYPINGS_PATH =  path.resolve(__dirname, "..", "..", "..", TsdHelper.CORDOVA_TYPINGS_FOLDERNAME);

   private static installTypeDefinitionFile(src: string, dest: string): Q.Promise<any> {
       if (CordovaProjectHelper.existsSync(dest)) {
           return;
       }

       // Ensure that the parent folder exits; if not, create the hierarchy of directories
       let parentFolder = path.resolve(dest, "..");
       if (!CordovaProjectHelper.existsSync(parentFolder)) {
           CordovaProjectHelper.makeDirectoryRecursive(parentFolder);
       }

       return CordovaProjectHelper.copyFile(src, dest);
   }

   /**
    *   Helper to install type defintion files for Cordova plugins and Ionic projects.
    *   {typingsFolderPath} - the parent folder where the type definitions need to be installed
    *   {typeDefsPath} - the relative paths of all plugin type definitions that need to be
    *                    installed (relative to <project_root>\.vscode\typings)
    */
    public static installTypings(typingsFolderPath: string, typeDefsPath: string[]): void {
        TelemetryHelper.generate('addTypings', (generator) => {
            generator.add('addedTypeDefinitions', typeDefsPath, false);
            return Q.all(typeDefsPath.map((relativePath: string): Q.Promise<any> => {
                let src = path.resolve(TsdHelper.CORDOVA_TYPINGS_PATH, relativePath);
                let dest = path.resolve(typingsFolderPath, relativePath);
                return TsdHelper.installTypeDefinitionFile(src, dest);
            }));
        });
    }
}