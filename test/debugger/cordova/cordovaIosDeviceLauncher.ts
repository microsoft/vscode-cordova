import * as mockery from 'mockery';

// Used only for the type to allow mocking
import {CordovaIosDeviceLauncher as _CordovaIosDeviceLauncher} from '../../../src/debugger/cordova/cordovaIosDeviceLauncher';

let CordovaIosDeviceLauncher: typeof _CordovaIosDeviceLauncher;

describe('cordovaIosDeviceLauncher', function () {
    let plistMock: any = {};
    let fsMock: any = {};

    before(() => {
        mockery.enable({warnOnReplace: false, useCleanCache: true});
        mockery.registerAllowables([
            '../../../src/debugger/cordova/cordovaIosDeviceLauncher',
            'path',
            'q'
        ]);
        mockery.registerMock('child_process', {});
        mockery.registerMock('net', {});

        mockery.registerMock('fs', fsMock);
        mockery.registerMock('plist-with-patches', plistMock);
        CordovaIosDeviceLauncher = require('../../../src/debugger/cordova/cordovaIosDeviceLauncher').CordovaIosDeviceLauncher;
    });
    after(() => {
        mockery.disable();
    });

    beforeEach(() => {
        let mocksToReset = [fsMock, plistMock];
        mocksToReset.forEach(mock => {
            for (let prop in mock) {
                if (mock.hasOwnProperty(prop)) {
                    delete mock[prop];
                }
            }
        });
    });

    it('should be able to find the bundle identifier', () => {
        fsMock.readdir = (path: string, callback: (err: Error, result: string[]) => void) => callback(null, ['foo', 'bar.xcodeproj']);
        plistMock.parseFileSync = (file: string) => {
            return {CFBundleIdentifier: 'test.bundle.identifier'};
        };

        return CordovaIosDeviceLauncher.getBundleIdentifier('testApp').then((bundleId) => {
            bundleId.should.equal('test.bundle.identifier');
        });
    });
});