## 2.7.0
* Add cordova clean command [#957](https://github.com/microsoft/vscode-cordova/pull/957)
* Rename debug configurations [#950](https://github.com/microsoft/vscode-cordova/pull/950)
* Update cordova hostname customization support [#944](https://github.com/microsoft/vscode-cordova/pull/944)
* Support default breakpoints filters for exceptions [#943](https://github.com/microsoft/vscode-cordova/pull/943)
* Internal changes:
* Bump es5-ext from 0.10.53 to 0.10.63 [#954](https://github.com/microsoft/vscode-cordova/pull/954)
* Refactor structures for cordova command palette feature [#953](https://github.com/microsoft/vscode-cordova/pull/953)
* Bump ip from 1.1.5 to 1.1.9 [#952](https://github.com/microsoft/vscode-cordova/pull/952)

## 2.6.7
* Improve pwa-chrome configuration settings for cordova-android [#924](https://github.com/microsoft/vscode-cordova/pull/924)
* Check cordova-android version when launch android debugging [#933](https://github.com/microsoft/vscode-cordova/pull/933)
* Internal changes:
  * Bump @babel/traverse from 7.18.5 to 7.23.2 [#921](https://github.com/microsoft/vscode-cordova/pull/921)
  * Add unit test for AndroidInsecureFileModeEnabled config [#932](https://github.com/microsoft/vscode-cordova/pull/932)
  * Gulp script failure on Node18 in gulp-typescript package [#936](https://github.com/microsoft/vscode-cordova/pull/936)
  * Bump vscode-test to 2.3.8 [#937](https://github.com/microsoft/vscode-cordova/pull/937)
  * Bump eslint package to support typescript 5.0.0+ [#941](https://github.com/microsoft/vscode-cordova/pull/941)

## 2.6.6
* Fixed "env" variables not working any more [#914](https://github.com/microsoft/vscode-cordova/pull/914)
* Update environment variable for current process [#915](https://github.com/microsoft/vscode-cordova/issues/915)
* [CodeQL] Fix CodeQL analysis alert: Do not use eval or the Function constructor [#917](https://github.com/microsoft/vscode-cordova/pull/917)
* Internal changes:
  * Update vscode-debugadapter to @vscode/debugadapter [#919](https://github.com/microsoft/vscode-cordova/pull/919)

## 2.6.5
* Refactored user data directory creating logic for browsers [#897](https://github.com/microsoft/vscode-cordova/pull/897)
* Fixed "Unable to find 'localabstract' name" issue [#904](https://github.com/microsoft/vscode-cordova/issues/904)
* Updated application build path for iOS [#907](https://github.com/microsoft/vscode-cordova/pull/907)
* Internal changes:
  * Fix security vulnerabilities
  * Better unit testing coverage [#900](https://github.com/microsoft/vscode-cordova/pull/900)
  * Removed redundant testing reports [#903](https://github.com/microsoft/vscode-cordova/issues/903)

## 2.6.4
* Customize project root in subfolder for cordova-simulate options [#887](https://github.com/microsoft/vscode-cordova/pull/887)
* Add localization for new strings [#867](https://github.com/microsoft/vscode-cordova/pull/867)
* Update Documentation: Add new known issue on iOS debugging [#863](https://github.com/microsoft/vscode-cordova/pull/863)
* Internal changes:
  * Fix security vulnerabilities
  * Add localization unit tests and related pipeline task [#861](https://github.com/microsoft/vscode-cordova/pull/861)
  * Update vscode marketpace badge service [#871](https://github.com/microsoft/vscode-cordova/pull/871)

## 2.6.3
* Add vscode-js-debug dependency in package.json [#851](https://github.com/microsoft/vscode-cordova/pull/851)
* Check updates for all package modules in extension [#858](https://github.com/microsoft/vscode-cordova/pull/858)
* Internal changes:
  * Update gulp clean list [#838](https://github.com/microsoft/vscode-cordova/pull/838)
  * Fix node ECONNRESET error in MacOS [#844](https://github.com/microsoft/vscode-cordova/pull/844)
  * Add junit test report and publish test result to pipeline build run [#848](https://github.com/microsoft/vscode-cordova/pull/848)
  * Cleanup and update 3rd party notices file [#855](https://github.com/microsoft/vscode-cordova/pull/855)

## 2.6.2
* Improve unit test and test report [#818](https://github.com/microsoft/vscode-cordova/issues/818)
* Simplify gulfile.js by moving the scripts to separate files per function [#794](https://github.com/microsoft/vscode-cordova/issues/794)
* Update vscode marketplace badge [#830](https://github.com/microsoft/vscode-cordova/pull/830)
* Internal changes:
  * Update .gitignore file and gulp format task ignore list [#804](https://github.com/microsoft/vscode-cordova/issues/804)
  * Enable CodeQL for ADO pipeline [#812](https://github.com/microsoft/vscode-cordova/pull/812)
  * Add lgtm.yml config file [#823](https://github.com/microsoft/vscode-cordova/pull/823)

## 2.6.1
* Fix debugger blocker caused by package module issue [#802](https://github.com/microsoft/vscode-cordova/pull/802)

## 2.6.0
* Added error code for Telemetry events [#788](https://github.com/microsoft/vscode-cordova/pull/788)
* Fixed bug Cordova iOS debugger is not working on some high version iOS devices [#779](https://github.com/microsoft/vscode-cordova/issues/779)
* Refactored Cordova debug session [#749](https://github.com/microsoft/vscode-cordova/pull/749)
* Internal changes:
  * Fixed bug Do not delete Cordova project file in test resource when execute gulp clean [#784](https://github.com/microsoft/vscode-cordova/issues/784)
  * Added husky pre-commit to verify code format [#790](https://github.com/microsoft/vscode-cordova/issues/790)
  Fixed bug Could not find the task 'gulp: prepare-integration-tests' [#783](https://github.com/microsoft/vscode-cordova/issues/783)
  * Fixed bug Do not delete Cordova project file in test resource when execute gulp clean [#784](https://github.com/microsoft/vscode-cordova/issues/784)
  * Replaced tasks in gulpfile with exports [#781](https://github.com/microsoft/vscode-cordova/issues/781)

## 2.5.0
* Added support for iOS simulators [#758](https://github.com/microsoft/vscode-cordova/pull/758)
* Improved sourcemap URLs processing for Cordova projects with typescript [#762](https://github.com/microsoft/vscode-cordova/issues/762)
* Fixed bug `"Chrome did not shut down correctly"` after closing browser window via stopping debugging in VSCode [#767](https://github.com/microsoft/vscode-cordova/pull/767)
* Fixed auto unchecking default breakpoints filters for exceptions [#768](https://github.com/microsoft/vscode-cordova/pull/768)
* Fixed security vulnerabilities [#763](https://github.com/microsoft/vscode-cordova/pull/763), [#764](https://github.com/microsoft/vscode-cordova/pull/764)

## 2.4.1
* Added Ionic 6 version support [#748](https://github.com/microsoft/vscode-cordova/pull/748)
* Implemented the `spaUrlRewrite` option for Simulate debug scenarios to improve page refreshing in case of URL rewrites caused by the router in single page applications [#750](https://github.com/microsoft/vscode-cordova/issues/750)
* Fixed security vulnerabilities [#751](https://github.com/microsoft/vscode-cordova/pull/751), [#752](https://github.com/microsoft/vscode-cordova/pull/752)

## 2.4.0
* Improved Android device and emulator targets selection [#736](https://github.com/microsoft/vscode-cordova/pull/736)
* Fixed security vulnerabilities [#740](https://github.com/microsoft/vscode-cordova/pull/740), [#743](https://github.com/microsoft/vscode-cordova/pull/743)
* Fixed source mapping while debugging Ionic Cordova-Android 10 applications [#744](https://github.com/microsoft/vscode-cordova/issues/744)
* Internal changes:
    * Refactored Chrome DevTools Protocol message handles for the CDP proxy [#741](https://github.com/microsoft/vscode-cordova/pull/741)

## 2.3.0
* Fixed security vulnerabilities [#734](https://github.com/microsoft/vscode-cordova/pull/734)
* Updated debugging configurations documentation [#732](https://github.com/microsoft/vscode-cordova/pull/732)
* Internal changes:
    * Got rid of Q promises [#728](https://github.com/microsoft/vscode-cordova/pull/728)

## 2.2.3
* Fixed security vulnerabilities [#724](https://github.com/microsoft/vscode-cordova/pull/724), [#726](https://github.com/microsoft/vscode-cordova/pull/726), [#729](https://github.com/microsoft/vscode-cordova/pull/729)
* Fixed sending telemetry from debug adapter [#730](https://github.com/microsoft/vscode-cordova/pull/730)

## 2.2.2
* Fixed security vulnerabilities [#718](https://github.com/microsoft/vscode-cordova/pull/718), [#717](https://github.com/microsoft/vscode-cordova/pull/717), [#719](https://github.com/microsoft/vscode-cordova/pull/719)
* Configured [support of virtual workspaces](https://github.com/microsoft/vscode-cordova/issues/716) [#719](https://github.com/microsoft/vscode-cordova/pull/719)
* Configured [support of Workspace Trust feature](https://github.com/microsoft/vscode-cordova/issues/715): the extension requires a workspace to be trusted to debug code and run Command Palette commands [#719](https://github.com/microsoft/vscode-cordova/pull/719)

## 2.2.1
* Fixed security vulnerabilities [#704](https://github.com/microsoft/vscode-cordova/pull/704), [#707](https://github.com/microsoft/vscode-cordova/pull/707), [#711](https://github.com/microsoft/vscode-cordova/pull/711), [#712](https://github.com/microsoft/vscode-cordova/pull/712)
* Added support of the `--buildFlag` flag in run arguments [#710](https://github.com/microsoft/vscode-cordova/pull/710)
* Fixed the order of termination of debugging sessions [#709](https://github.com/microsoft/vscode-cordova/pull/709)

## 2.2.0
* Fixed security vulnerabilities [#695](https://github.com/microsoft/vscode-cordova/pull/695)
* Refactored Command Palette commands for Ionic applications (`Ionic: Build`, `Ionic: Run` and `Ionic: Prepare`) to adapt them to the new Ionic commands syntax [#698](https://github.com/microsoft/vscode-cordova/pull/698)
* Implemented Android emulator selection when starting debug scenarios [#699](https://github.com/microsoft/vscode-cordova/pull/699)

## 2.1.2
* Fixed incorrect behavior of the `Restart Cordova debugging` button [#685](https://github.com/microsoft/vscode-cordova/issues/685), [691](https://github.com/microsoft/vscode-cordova/pull/691)

## 2.1.1
* Updated the extension supported languages for breakpoints in order to work with the latest VS Code API [#689](https://github.com/microsoft/vscode-cordova/pull/689)

## 2.1.0
* Fixed debugging of Ionic applications with live reload on iOS devices [#679](https://github.com/microsoft/vscode-cordova/pull/679)
* Fixed debugging in remote containers [#680](https://github.com/microsoft/vscode-cordova/issues/680), [#682](https://github.com/microsoft/vscode-cordova/pull/682)
* Added support of MS Edge Chromium browser for Ionic Serve debugging scenarios [#684](https://github.com/microsoft/vscode-cordova/pull/684)
* Added the `runtimeVersion` debug scenario argument which allows to select a specific version of Node.js if `nvm` (or `nvm-windows`) or `nvs` is used for managing Node.js versions [#686](https://github.com/microsoft/vscode-cordova/pull/686)
* Added the `Restart Cordova debugging` button to the debug toolbar, which allows to restart a Cordova application debugging correctly. In case of a `launch` debug scenario the application will be rebuild otherwise the debugger will reattach to the application. [#685](https://github.com/microsoft/vscode-cordova/issues/685), [#687](https://github.com/microsoft/vscode-cordova/pull/687)

## 2.0.0
* Fixed iOS debugging on iOS devices version 12.2 and above [#641](https://github.com/microsoft/vscode-cordova/pull/641), [#649](https://github.com/microsoft/vscode-cordova/pull/649), [#671](https://github.com/microsoft/vscode-cordova/pull/671)
* Implmented debug configuration provider using the [`DebugConfigurationProvider`](https://code.visualstudio.com/api/extension-guides/debugger-extension#using-a-debugconfigurationprovider) VS Code approach [#648](https://github.com/microsoft/vscode-cordova/pull/648)
* Cordova Simulate is no longer part of the extension and is installed dynamically in the extension on Simulate debug scenarios [#653](https://github.com/microsoft/vscode-cordova/pull/653)
* Added localization for next languages:
  * Chinese Simplified
  * Chinese Traditional
  * Japanese
  * Korean
  * German
  * French
  * Spanish
  * Russian
  * Italian
  * Czech
  * Turkish
  * Portuguese
  * Polish
* Added `liveReloadDelay` debug scenario argument for Simulate scenarios. It allows to set the delay in milliseconds between saving of a modified file and the application page reloading [#672](https://github.com/microsoft/vscode-cordova/pull/672)
* Changed spellings of some debug configurations properties in order to suit camel case: `corsproxy` to `corsProxy`, `forceprepare` to `forcePrepare`
* The minimum supported version of VS Code has been increased from `1.26.0` to `1.40.0`
* Internal changes:
    * Migrated from the [`vscode-node-debug2`](https://github.com/microsoft/vscode-node-debug2) debugger to [`js-debug`](https://github.com/microsoft/vscode-js-debug) one
    * Integrated the debug adapter directly inside the extension, which allows VS Code to connect to it instead of launching a new external debug adapter per extension's debugging session. See [`DebugAdapterDescriptorFactory`](https://code.visualstudio.com/api/extension-guides/debugger-extension#alternative-approach-to-develop-a-debugger-extension) approach for more details
    * Added Webpack bundling for the extension [#653](https://github.com/microsoft/vscode-cordova/pull/653)
    * Overall code improvements and optimizations [#647](https://github.com/microsoft/vscode-cordova/pull/647), [#649](https://github.com/microsoft/vscode-cordova/pull/649), [#669](https://github.com/microsoft/vscode-cordova/pull/669), [#636](https://github.com/microsoft/vscode-cordova/pull/636), [#666](https://github.com/microsoft/vscode-cordova/pull/666)

## 1.9.5
* Improved extension security [#639](https://github.com/microsoft/vscode-cordova/pull/639), [#642](https://github.com/microsoft/vscode-cordova/pull/642), [#621](https://github.com/microsoft/vscode-cordova/pull/621)
* Internal changes:
    * Migrated unit tests to vscode-test [#645](https://github.com/microsoft/vscode-cordova/pull/645)

## 1.9.4
* Improved extension security [#620](https://github.com/microsoft/vscode-cordova/pull/620)
* Internal changes:
    * Added YAML Azure Pipelines support for the extension repository [#607](https://github.com/microsoft/vscode-cordova/pull/607)
    * Enhanced extension telemetry [#619](https://github.com/microsoft/vscode-cordova/pull/619), [#611](https://github.com/microsoft/vscode-cordova/pull/611)

## 1.9.3
* Improved extension security [#603](https://github.com/microsoft/vscode-cordova/pull/603), [#604](https://github.com/microsoft/vscode-cordova/pull/604)
* Updated extension dependencies [#604](https://github.com/microsoft/vscode-cordova/pull/604)

## 1.9.2
* Fixed launching and deployment of Cordova and Ionic applications on iOS 13+ devices [#600](https://github.com/microsoft/vscode-cordova/pull/600)
* Enhanced error handling in case an opened project is not a Cordova project [#599](https://github.com/microsoft/vscode-cordova/pull/599)
* deps: cordova-simulate@0.7.0

## 1.9.1
* Added error notifications about usage of incorrect `cwd` parameter on debugging a project located in a subdirectory [#593](https://github.com/microsoft/vscode-cordova/pull/593)
* Updated troubleshooting documentation for the issue [#574](https://github.com/microsoft/vscode-cordova/issues/574) ([#575](https://github.com/microsoft/vscode-cordova/pull/575)), thanks to [David Cox-Espenlaub(@newdaveespionage)](https://github.com/newdaveespionage)
* Enhanced extension security
* Deps: `vscode-chrome-debug-core@6.8.7`

## 1.9.0
* Added [inline breakpoints feature](https://github.com/microsoft/vscode/issues/31612) support
* Added additional string to verify application build status for Ionic apps with live reload [#572](https://github.com/microsoft/vscode-cordova/pull/572)
* Optimized extension activation events [#584](https://github.com/microsoft/vscode-cordova/pull/584)
* Updated core debugger dependencies

## 1.8.6
* Fixed security vulnerabilities
* deps: cordova-simulate@0.6.6
* Fixed source mapping for Ionic 4 applications on Angular 8, which caused unverified breakpoints while debugging

## 1.8.5
* Fixed security vulnerabilities

## 1.8.4
* Fixed security vulnerabilities
* Improved activation events

## 1.8.3
* Fixed security vulnerabilities
* Bumped Typescript version to `2.9.2`

## 1.8.2
* Deps: `cordova-simulate@0.6.2`
* Added attachTimeout variable to attach and launch args
* Publisher changed from `vsmobile` to `msjsdiag`

## 1.8.1
* Fixed error "Application not installed on the device" while debugging Cordova 9 iOS apps
* Fixed [js-yaml security vulnerability](https://www.npmjs.com/advisories/788)
* Fixed [tar security vulnerability](https://www.npmjs.com/advisories/803)
* Bumped debug core dependencies versions to the more recent ones
* Fixed minor bugs

## 1.8.0
* Disable debugging Cordova apps on iOS simulators. Please, see details [here](https://github.com/Microsoft/vscode-cordova/blob/ffd0e244f253d5324253368401edced1ca087b6d/README.md#why-cant-i-debug-my-app-on-ios-simulator)
* Fix several issues with debugging Ionic apps when livereload option is enabled [#494](https://github.com/Microsoft/vscode-cordova/pull/494)
* Fix Ionic command pallette commands [#508](https://github.com/Microsoft/vscode-cordova/pull/508)

## 1.7.0
* Fix security vulnerabilities caused by cordova-simulate dependencies [#479](https://github.com/Microsoft/vscode-cordova/pull/479)

## 1.6.2
* Fix issue that caused extension crashes on macOS with VS Code Insiders 1.31 [#472](https://github.com/Microsoft/vscode-cordova/issues/472)
* Fix debugging issues on macOS with VS Code Insiders 1.31 connected to changes in `unlink` function in Node 10 [#474](https://github.com/Microsoft/vscode-cordova/pull/474)

## 1.6.1
* Fix several security vulnerabilities
* Fix debugging problems on Windows with non-latin locale [#460](https://github.com/Microsoft/vscode-cordova/issues/460)
* Fix simulate scenarios on android on Linux [#438](https://github.com/Microsoft/vscode-cordova/issues/438)

## 1.6.0

* Move to Azure pipelines builds instead of Travis CI for pull requests validation
* `previewHtml` will be deprecated in the future releases of VS Code and due to this the following changes were made:
  * Simulate window now opens in a browser instead of opening inside VS Code
  * `simulatorInExternalBrowser` and `cordova.simulatorInExternalBrowser` settings was removed

## 1.5.1

* Return extension name back to "Cordova Tools"

## 1.5.0

* Added Ionic 4 beta support
* Added support for cordovaExecutable, env, envFile as a launch parameters
* Extension title renamed from `Cordova Tools` to `Ionic and Cordova Tools`
* Fixed several bugs affecting debugging experience

## 1.4.0

* Migrate to [cordova-simulate@0.4.0](https://github.com/Microsoft/cordova-simulate/releases/tag/0.4.0)
* Added target platform selector for command palette commands
* Added cordova-simulate support for all known platform
* Added `.travis.yml`

## 1.3.10

* Added target type to telemetry request
* Added support for Ionic projects without Cordova integration
* Bug fixes and improvements

## 1.3.9

* Migrated CodePush functionality to App Center extension for VS Code

## 1.3.8

* Remove local file dependencies for code-push libs from package.json
* Bug fixes

## 1.3.7

* Bug fixes

## 1.3.6

* Added support for cordova-code-push commands

## 1.3.5

* Updated README

## 1.3.4

* Fixed issue with launch args in vscode 1.20.0
* Added survey to README

## 1.3.3

* Fix platforms detection according to new files structure
* Fix error message if browser simulation fails
* Fix Ionic projects launch and attach for iOS simulator
* Fix Ionic CLI version detection if CLI update is available
* Fix missing platform error message for Ionic

## 1.3.2

* Allow "non Ionic-CLI projects" to use the extension even with ionic-angular installed
* Adds `cordova.simulatorInExternalBrowser` setting that makes Cordova simulator to launch in default browser instead of tab in VS Code
* Support new path of AndroidManifest.xml in Cordova 8.0.0
* Fix ionic nightly version detection
* Fix Ionic 1 livereload server detection

## 1.3.1

* Granted permissions to scripts

## 1.3.0

* Multi-root workspaces support

## 1.2.13

* Added `runArguments` configuration option to allow passing custom arguments to `cordova run/build` or `ionic serve` commands
* Fixed problem with cordova/ionic check updates

## 1.2.12

* Fixed application debug port detection on Android Oreo

## 1.2.11

* Fixed attach failure when both device and emulator are connected
* Fixed problem with attaching debugger to apps with some specific names

## 1.2.10

* Fixed debugger can't find "localabstract name" issue by better parsing of `adb shell ps` output
* Cleaned up noisy Ionic output in debug console
* Improved detection of latest Ionic CLI to better handle 'ionic cordova' plugin/integration
* Improved handling of typings in typescript projects
* Fixed annoying `Debugger.setAsyncCallStackDepth` error appeared after upgrading vscode-chrome-debug-core

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
