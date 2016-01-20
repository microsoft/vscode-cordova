# Debugger for Cordova
A VS Code extension to debug your JavaScript code in Cordova applications.

## Starting
The extension operates in two modes - it can launch a Cordova app, or it can attach to a running app. Just like when using the Node debugger, you configure these modes with a `.vscode/launch.json` file in the root directory of your project. You can create this file manually, or Code will create one for you if you try to run your project, and it doesn't exist yet.

To use this extension, you must first open the folder containing the project you want to work on.

### Launch
Two example `launch.json` configs. You must specify which `platform` to launch or attach to, and it must be either `"android"` or `"ios"`. You may also specify a `target` which is either `"device"` to work with a physical device, `"emulator"` to work with an arbitrary emulator, or a valid option for Cordova's `target` parameter to specify a particular emulator.

```
{
    "version": "0.1.0",
    "configurations": [
        {
            "name": "Launch app on Android Device",
            "type": "cordova",
            "request": "launch",
            "platform": "android",
            "target": "device"
        },
        {
            "name": "Launch app on iOS emulator for iPhone 4",
            "type": "cordova",
            "request": "launch",
            "platform": "ios",
            "target": "iPhone-4s"
        }
    ]
}
```


### Attach
To attach to an already running app, you must specify which platform to target, and whether it is running in an emulator or on a device.

An example `launch.json` config.
```
{
    "version": "0.1.0",
    "configurations": [
        {
            "name": "Attach to android emulator",
            "type": "cordova",
            "request": "attach",
            "platform": "android",
            "target": "emulator"
        },
        {
            "name": "Attach to iOS device",
            "type": "cordova",
            "request": "attach",
            "platform": "ios",
            "target": "device"
        }
    ]
}
```



### Other optional launch config fields
* port: A port to use for proxying to the device/emulator. Defaults to 9222
* sourceMaps: a boolean value specifying whether to use javascript sourcemaps if they exist. Defaults to false.
* webkitRangeMin, webkitRangeMax: two numbers, specifying a port range to use for iOS. Devices and the simulator will use ports within this range to proxy through to the specific device/simulator. Defaults to 9223-9322
* attachAttempts: Number of attempts to make when attaching to an iOS app. Launching to the iOS simulator or a device can have a significant delay before the app is debuggable. Defaults to 5
* attachDelay: Delay in milliseconds between attach attempts for iOS. Defaults to 1000
* iosDebugProxyPort:  Port to use when launching iOS applications on a device. Defaults to 9221
* appStepLaunchTimeout: Timeout in milliseconds for individual steps when launching an iOS app on a device. Defaults to 5000

## Usage
When your launch config is set up, you can debug your project! Pick a launch config from the dropdown on the Debug pane in Code. Press the play button or F5 to start.

**Things that should work**
* Setting breakpoints, including in source files when source maps are enabled
* Stepping, including with the buttons on the Chrome page
* The Locals pane
* Debugging eval scripts, script tags, and scripts that are added dynamically
* Watches
* The debug console
* Most console APIs

**Unsupported scenarios**
* Debugging webworkers

## Troubleshooting
General things to try if you're having issues:
* If sourcemaps are enabled, ensure `sourceRoot` is an absolute path
* Ensure nothing else is using port 9222, or specify a different port in your launch config
* Check the console for warnings that this extension prints in some cases when it can't attach
* File a bug in this extension's [GitHub repo](https://github.com/Microsoft/vscode-webkit-debug). Set the "diagnosticLogging" field in your launch config and attach the logs when filing a bug.
