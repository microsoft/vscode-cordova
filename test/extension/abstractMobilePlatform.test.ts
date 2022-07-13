// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import AbstractMobilePlatform from "../../src/extension/abstractMobilePlatform";
import { CordovaWorkspaceManager } from "../../src/extension/cordovaWorkspaceManager";
import { IGeneralAttachResult } from "../../src/extension/platformAttachResult";
import { IGeneralLaunchResult } from "../../src/extension/platformLaunchResult";
import { IGeneralPlatformOptions } from "../../src/extension/platformOptions";
import { PluginSimulator } from "../../src/extension/simulate";
import { CordovaProjectHelper, ProjectType } from "../../src/utils/cordovaProjectHelper";
import IonicDevServer from "../../src/utils/ionicDevServer";
import { IDebuggableMobileTarget, IMobileTarget, MobileTarget } from "../../src/utils/mobileTarget";
import { MobileTargetManager } from "../../src/utils/mobileTargetManager";
import { TargetType } from "../../src/debugger/cordovaDebugSession";
import assert = require("assert");

suite("AbstractMobilePlatform", function () {
    let onlineDevice1: IDebuggableMobileTarget = {
        name: "onlineDevice1",
        id: "onlineDevice1",
        isOnline: true,
        isVirtualTarget: false,
    };
    let onlineDevice2: IDebuggableMobileTarget = {
        name: "onlineDevice2",
        id: "onlineDevice2",
        isOnline: true,
        isVirtualTarget: false,
    };
    let offlineSimulator: IDebuggableMobileTarget = {
        name: "offlineSimulator",
        id: "offlineSimulator",
        isOnline: false,
        isVirtualTarget: true,
    };
    let onlineSimulator: IDebuggableMobileTarget = {
        name: "onlineSimulator",
        id: "onlineSimulator",
        isOnline: true,
        isVirtualTarget: true,
    };

    let collectedTargets: IDebuggableMobileTarget[];

    class TestMobileTarget extends MobileTarget {}

    class TestMobileTargetManager extends MobileTargetManager<TestMobileTarget> {
        public async collectTargets(
            targetType?: TargetType.Emulator | TargetType.Device,
        ): Promise<void> {
            this.targets = collectedTargets;
        }

        public async selectAndPrepareTarget(
            filter?: (el: IMobileTarget) => boolean,
        ): Promise<TestMobileTarget> {
            const selectedTarget = await this.selectTarget(filter);
            if (selectedTarget) {
                return selectedTarget.isVirtualTarget &&
                    (!selectedTarget.isOnline || !selectedTarget.id)
                    ? this.launchSimulator(selectedTarget)
                    : new TestMobileTarget(selectedTarget as IDebuggableMobileTarget);
            }
            return undefined;
        }

        protected async launchSimulator(emulatorTarget: IMobileTarget): Promise<TestMobileTarget> {
            if (!emulatorTarget.id) {
                emulatorTarget.id = "tmpId";
            }
            emulatorTarget.isOnline = true;
            return new TestMobileTarget(emulatorTarget as IDebuggableMobileTarget);
        }

        protected startSelection(filter?: (el: IMobileTarget) => boolean): Promise<IMobileTarget> {
            throw new Error("Method not implemented.");
        }
    }

    class TestMobilePlatform extends AbstractMobilePlatform<
        TestMobileTarget,
        TestMobileTargetManager
    > {
        public async getTargetFromRunArgs(): Promise<MobileTarget | undefined> {
            await this.targetManager.collectTargets();
            if (this.platformOpts.runArguments && this.platformOpts.runArguments.length > 0) {
                const targetId = AbstractMobilePlatform.getOptFromRunArgs(
                    this.platformOpts.runArguments,
                    "--target",
                );

                if (targetId) {
                    const targets = await this.targetManager.getTargetList();
                    const target = targets.find(
                        target => target.id === targetId || target.name === targetId,
                    );
                    if (target) {
                        return new TestMobileTarget(target as IDebuggableMobileTarget);
                    }
                }
            }

            return undefined;
        }

        protected async getFirstAvailableOnlineTarget(): Promise<MobileTarget> {
            return new TestMobileTarget(
                (await this.getFirstDebuggableTarget()) as IDebuggableMobileTarget,
            );
        }

        public launchApp(): Promise<IGeneralLaunchResult> {
            throw Error("Not implemented yet");
        }

        public prepareForAttach(): Promise<IGeneralAttachResult> {
            throw Error("Not implemented yet");
        }

        public getRunArguments(): string[] {
            throw Error("Not implemented yet");
        }
    }

    const projectRoot = ".\\resources\\testCordovaProject";
    const workspaceManager = new CordovaWorkspaceManager(new PluginSimulator(), {
        uri: vscode.Uri.file(projectRoot),
        name: "testCordovaProject",
        index: 1,
    });
    const projectType = new ProjectType(false, false, false, false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const logger = (str: string) => {};
    const ionicDevServer = new IonicDevServer(projectRoot, logger);
    const cordovaExecutable = CordovaProjectHelper.getCliCommand(projectRoot);
    const cancellationTokenSource = new vscode.CancellationTokenSource();
    const port = 9222;
    const platformOptions: IGeneralPlatformOptions = {
        projectRoot,
        projectType,
        workspaceManager,
        ionicDevServer,
        cordovaExecutable,
        cancellationTokenSource,
        env: {},
        port,
    };

    const mobilePlatform = new TestMobilePlatform(platformOptions, logger);

    suite("resolveMobileTarget", function () {
        beforeEach(function () {
            collectedTargets = [onlineDevice1, onlineDevice2, offlineSimulator, onlineSimulator];
        });

        test(`Should resolve any device for target: ${TargetType.Device}`, async function () {
            const target = await mobilePlatform.resolveMobileTarget(TargetType.Device);
            assert.strictEqual(target.isVirtualTarget, false, "Selected target is not device");
        });

        test(`Should resolve any emulator for target: ${TargetType.Emulator}`, async function () {
            const target = await mobilePlatform.resolveMobileTarget(TargetType.Emulator);
            assert.strictEqual(target.isVirtualTarget, true, "Selected target is not emulator");
        });

        test("Should resolve target by name", async function () {
            const target = await mobilePlatform.resolveMobileTarget(offlineSimulator.name);
            assert.strictEqual(
                target.name,
                offlineSimulator.name,
                "Selected target is not target with passed name",
            );
        });

        test("Should resolve target by id", async function () {
            const target = await mobilePlatform.resolveMobileTarget(offlineSimulator.id);
            assert.strictEqual(
                target.id,
                offlineSimulator.id,
                "Selected target is not target with passed id",
            );
        });
    });

    suite("getPreferredTarget", function () {
        beforeEach(function () {
            collectedTargets = [onlineDevice1, onlineDevice2, offlineSimulator, onlineSimulator];
        });

        test(`Should resolve any device for target: ${TargetType.Device}`, async function () {
            const target = await mobilePlatform.resolveMobileTarget(TargetType.Device);
            assert.strictEqual(target.isVirtualTarget, false, "Selected target is not device");
        });

        test(`Should resolve any emulator for target: ${TargetType.Emulator}`, async function () {
            const target = await mobilePlatform.resolveMobileTarget(TargetType.Emulator);
            assert.strictEqual(target.isVirtualTarget, true, "Selected target is not emulator");
        });

        test("Should resolve target by name", async function () {
            const target = await mobilePlatform.resolveMobileTarget(offlineSimulator.name);
            assert.strictEqual(
                target.name,
                offlineSimulator.name,
                "Selected target is not target with passed name",
            );
        });

        test("Should resolve target by id", async function () {
            const target = await mobilePlatform.resolveMobileTarget(offlineSimulator.id);
            assert.strictEqual(
                target.id,
                offlineSimulator.id,
                "Selected target is not target with passed id",
            );
        });
    });
});
