// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as assert from "assert";
import Sinon = require("sinon");
import { AdbHelper } from "../../src/utils/android/adb";
import { AndroidTarget, AndroidTargetManager } from "../../src/utils/android/androidTargetManager";
import { IDebuggableMobileTarget, IMobileTarget } from "../../src/utils/MobileTarget";
import { CancellationToken, QuickPickItem, QuickPickOptions, window } from "vscode";


suite("AndroidTargetManager", function () {
    const testProjectPath = path.join(__dirname, "..", "resources", "testCordovaProject");

    let onlineEmulator1: IMobileTarget = {name: "emulatorName1", id: "emulator-5551", isVirtualTarget: true, isOnline: true};
    let onlineEmulator2: IMobileTarget = {name: "emulatorName2", id: "emulator-5552", isVirtualTarget: true, isOnline: true};

    let oflineEmulator1: IMobileTarget = {name: "emulatorName3", id: undefined, isVirtualTarget: true, isOnline: false}; //id: emulator-5553
    let oflineEmulator2: IMobileTarget = {name: "emulatorName4", id: undefined, isVirtualTarget: true, isOnline: false}; //id: emulator-5554

    let device1: IMobileTarget = {id: "deviceid1", isVirtualTarget: false, isOnline: true};
    let device2: IMobileTarget = {id: "deviceid2", isVirtualTarget: false, isOnline: true};

    const adbHelper = new AdbHelper(testProjectPath);
    let getAbdsNamesStub = Sinon.stub(adbHelper, "getAvdsNames").callsFake(async () => {
        return [onlineEmulator1.name, onlineEmulator2.name, oflineEmulator1.name, oflineEmulator2.name];
    });
    let getOnlineTargetsStub = Sinon.stub(adbHelper, "getOnlineTargets").callsFake(async () => {
        return <IDebuggableMobileTarget[]> [onlineEmulator1, onlineEmulator2, oflineEmulator1, oflineEmulator2, device1, device2].filter(target => target.isOnline);
    });

    let androidTargetManager: AndroidTargetManager;
    let launchSimulatorStub = Sinon.stub(<any> androidTargetManager, "launchSimulator").callsFake(async (emulatorTarget: IMobileTarget) => {
        emulatorTarget.isOnline = true;
        switch (emulatorTarget) {
            case onlineEmulator1: emulatorTarget.id = "emulator-5551"; break;
            case onlineEmulator2: emulatorTarget.id = "emulator-5552"; break;
            case oflineEmulator1: emulatorTarget.id = "emulator-5553"; break;
            case oflineEmulator2: emulatorTarget.id = "emulator-5554"; break;
        }
        return AndroidTarget.fromInterface(<IDebuggableMobileTarget> emulatorTarget);
    });

    let optionIndexForTargetSelection = 0;
    let targetsForSelection: string[] = [];
    let showQuickPickStub = Sinon.stub(window, "showQuickPick").callsFake(async (items: string[] | Thenable<string[]> | QuickPickItem[] | Thenable<QuickPickItem[]>, options?: QuickPickOptions, token?: CancellationToken) => {
        targetsForSelection = <string[]> await items;
        return items[optionIndexForTargetSelection];
    });

    suiteTeardown(() => {
        getAbdsNamesStub.reset();
        getOnlineTargetsStub.reset();
        launchSimulatorStub.reset();
        showQuickPickStub.reset();
    });

    suite("Target selection", function () {

        async function checkTargetSeletionResult(filter: (target: IMobileTarget) => boolean, targetIndex?: number, selectionListCheck?: (options: string[]) => boolean, resultCheck?: (target: AndroidTarget) => boolean): Promise<void> {
            targetIndex ? optionIndexForTargetSelection = targetIndex : optionIndexForTargetSelection = 0;
            targetsForSelection = [];
            const target = await androidTargetManager.selectAndPrepareTarget(filter);
            selectionListCheck ?? assert.ok(selectionListCheck(targetsForSelection), );
            resultCheck ?? assert.ok(resultCheck(target));
        }

        setup(async () => {
            onlineEmulator1 = {name: "emulatorName1", id: "emulator-5551", isVirtualTarget: true, isOnline: true};
            onlineEmulator2 = {name: "emulatorName2", id: "emulator-5552", isVirtualTarget: true, isOnline: true};

            oflineEmulator1 = {name: "emulatorName3", id: undefined, isVirtualTarget: true, isOnline: false}; //id: emulator-5553
            oflineEmulator2 = {name: "emulatorName4", id: undefined, isVirtualTarget: true, isOnline: false}; //id: emulator-5554

            device1 = {id: "deviceid1", isVirtualTarget: false, isOnline: true};
            device2 = {id: "deviceid2", isVirtualTarget: false, isOnline: true};

            optionIndexForTargetSelection = 0;
            targetsForSelection = [];

            await androidTargetManager.collectTargets();
        });

        test("Should show all targets in case filter has not been defined", async function () {
            await androidTargetManager.selectAndPrepareTarget();
            assert.strictEqual(targetsForSelection.length, 6, "Did not show all targets");
        });

        test("Should show targets by filter", async function () {
            const onlineTargetsFilter = (target: IMobileTarget) => target.isOnline;
            const deviceTargetsFilter = (target: IMobileTarget) => !target.isVirtualTarget;
            const onlinevirtualTargetsFilter = (target: IMobileTarget) => target.isOnline && target.isVirtualTarget;
            const specificNameVirtualTargetFilter = (target: IMobileTarget) => target.isVirtualTarget && target.name === oflineEmulator1.name;
            const specificIdNameVirtualTargetFilter = (target: IMobileTarget) => target.isVirtualTarget && target.id === onlineEmulator2.id;
            const specificIdAnyTargetFilter = (target: IMobileTarget) => target.id === device1.id;




            await androidTargetManager.selectAndPrepareTarget();
            assert.strictEqual(targetsForSelection.length, 6, "Did not show all targets");
        });
    });

    suite("Target identification", function () {
        androidTargetManager = new AndroidTargetManager(adbHelper);

        test("Should properly recognize virtual target type", async function () {
            try {
                assert.strictEqual(await androidTargetManager.isVirtualTarget("emulator-1234"), true, "Could not recognize emulator id: (emulator-1234)");
            } catch {
                assert.fail("Could not recognize emulator id: (emulator-1234)");
            }
            try {
                assert.strictEqual(await androidTargetManager.isVirtualTarget("emulator"), true, "Could not recognize any emulator");
            } catch {
                assert.fail("Could not recognize any emulator");
            }
            try {
                assert.strictEqual(await androidTargetManager.isVirtualTarget("emulatorName2"), true, "Could not recognize emulator AVD name");
            } catch {
                assert.fail("Could not recognize emulator AVD name");
            }
            try {
                assert.strictEqual(await androidTargetManager.isVirtualTarget("emulaor-1234"), false, "Misrecognized emulator id: (emulaor-1234)");
            } catch {}
            try {
                assert.strictEqual(await androidTargetManager.isVirtualTarget("emulator--1234"), false, "Misrecognized emulator id: (emulator--1234)");
            } catch {}
            try {
                assert.strictEqual(await androidTargetManager.isVirtualTarget("emulaor1234"), false, "Misrecognized emulator id: (emulator1234)");
            } catch {}
            try {
                assert.strictEqual(await androidTargetManager.isVirtualTarget("1232emulator1234"), false, "Misrecognized emulator id: (1232emulator1234)");
            } catch {}
        });

        test("Should properly recognize device target", async function () {
            try {
                assert.strictEqual(await androidTargetManager.isVirtualTarget("device"), false, "Could not recognize any device");
            } catch {
                assert.fail("Could not recognize any device");
            }
            try {
                assert.strictEqual(await androidTargetManager.isVirtualTarget("deviceid1"), false, "Could not recognize device id");
            } catch {
                assert.fail("Could not recognize device id");
            }
            try {
                assert.strictEqual(await androidTargetManager.isVirtualTarget("deviceid111"), false, "Misrecognized device id: (deviceid111)");
            } catch {}
        });
    });
});
