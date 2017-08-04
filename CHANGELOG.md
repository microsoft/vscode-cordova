## 1.2.9

* Added chromium to valid "simulate" targets
* Fixed "Error processing "completions"" constantly popping up in debug console
* Fixed cordova-simulate tab to properly update

## 1.2.8

* Fixed debugging of Ionic CLIv3 projects
* Added launch.json configurations snippets
* Fixed numerous issues with debugging on iOS 10 devices/emulators
* Fixed numerous issues caused by changes in Ionic CLI
  - Fix running iOS on simulator with enabled livereload
  - Fixed Ionic run hang on Android
  - Show app launch logs continuously
  - Suppress irrelevant stderr output from Ionic

* Other usability improvements:
  - Now ignoring "cordova build/run" commands while debugging
  - Changed error messages format when platform is missing to be more informative
  - Android is now default platform for Ionic on Windows
  - Ionic snippets are now shown only for Ionic v1 projects


## 1.2.7
* Added telemetry reporting for which plugins are installed for the project
* Enabled logging ionic serve output to debug console
* Updated chrome-debug-core
* Fixed integration with ionic serve

## 1.2.6
* Updated to use newer chrome debugger
* Fixed an issue with launching apps on iOS 10.X devices

## 1.2.5
* Changed how we look for the webview debugging connection to work on devices with restricted permissions

## 1.2.4
* Changed how we add typings for intellisense to work with typescript 2 automatic typings acquisition
* Now all cordova command output will be included in the debug console
* Added support for debugging crosswalk webview on android (Thanks nicolashenry!)
* Added CHANGELOG.md!

## 1.2.3
* Updated to a newer version of Cordova Simulate
* Updated plist library to fix some bugs
* Updated documentation
