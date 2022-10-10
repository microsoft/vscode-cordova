// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import assert = require("assert");
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import Sinon = require("sinon");
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
import { DebugConsoleLogger, TargetType } from "../../src/debugger/cordovaDebugSession";
import { ErrorHelper } from "../../src/common/error/errorHelper";
import { InternalErrorCode } from "../../src/common/error/internalErrorCode";

suite("AbstractMobilePlatform", function () {
    const onlineDevice: IDebuggableMobileTarget = {
        name: "DeviceOnline",
        id: "DeviceOnline",
        isOnline: true,
        isVirtualTarget: false,
    };
    const offlineDevice: IDebuggableMobileTarget = {
        name: "DeviceOffline",
        id: "DeviceOffline",
        isOnline: false,
        isVirtualTarget: false,
    };
    const offlineSimulator: IDebuggableMobileTarget = {
        name: "emulatorOffline",
        id: "emulatorOffline",
        isOnline: false,
        isVirtualTarget: true,
    };
    const onlineSimulator: IDebuggableMobileTarget = {
        name: "emulatorOnline",
        id: "emulatorOnline",
        isOnline: true,
        isVirtualTarget: true,
    };

    const collectedTargets: IDebuggableMobileTarget[] = [
        onlineDevice,
        offlineDevice,
        offlineSimulator,
        onlineSimulator,
    ];

    nls.config({
        messageFormat: nls.MessageFormat.bundle,
        bundleFormat: nls.BundleFormat.standalone,
    })();

    class TestMobileTarget extends MobileTarget {}

    class TestMobileTargetManager extends MobileTargetManager<TestMobileTarget> {
        public async collectTargets(
            targetType?: TargetType.Emulator | TargetType.Device,
        ): Promise<void> {
            this.targets = collectedTargets;
        }

        public async isVirtualTarget(target: string): Promise<boolean> {
            if (target === TargetType.Device || target.includes(TargetType.Device)) {
                return false;
            } else if (target === TargetType.Emulator || target.includes(TargetType.Emulator)) {
                return true;
            }
            throw ErrorHelper.getInternalError(
                InternalErrorCode.CouldNotRecognizeTargetType,
                target,
            );
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

        protected async startSelection(
            filter?: (el: IMobileTarget) => boolean,
        ): Promise<IMobileTarget> {
            const selectedTarget = await this.selectTarget(filter);
            return selectedTarget;
        }
    }

    class TestMobilePlatform extends AbstractMobilePlatform<
        TestMobileTarget,
        TestMobileTargetManager
    > {
        constructor(
            protected platformOpts: IGeneralPlatformOptions,
            protected log: DebugConsoleLogger,
        ) {
            super(platformOpts, log);
            this.targetManager = new TestMobileTargetManager();
        }

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
            return this.platformOpts.runArguments;
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

    let showQuickPickStub: Sinon.SinonStub;

    suiteSetup(() => {
        showQuickPickStub = Sinon.stub(vscode.window, "showQuickPick").callsFake(
            async (
                items:
                    | string[]
                    | Thenable<string[]>
                    | vscode.QuickPickItem[]
                    | Thenable<vscode.QuickPickItem[]>,
            ) => {
                return items[0];
            },
        );
    });

    suiteTeardown(() => {
        showQuickPickStub.restore();
    });

    const mobilePlatform = new TestMobilePlatform(platformOptions, logger);

    suite("resolveMobileTarget", function () {
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
