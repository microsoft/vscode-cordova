import {CordovaPathTransformer} from '../../../src/debugger/cordova/cordovaPathTransformer';

import * as path from 'path';

import 'should';

describe('CordovaPathTransformer', () => {

   it('should correctly convert merges paths for android', () => {
       let output = '';
       let logger = (message: string) => output += message + '\n';
       let pathTransformer = new CordovaPathTransformer(logger);

       // __dirname is '/out/test/debugger/cordova' so we need to step up four levels to escape completely
       let testapp = path.join(__dirname, '..', '..', '..', '..', 'test', 'testDebuggerProject');
       pathTransformer.attach({cwd: testapp, platform: 'android', port: 1234});

       pathTransformer.getClientPath('file:///android_asset/www/js/index.js').toLowerCase().should.equal(path.resolve(testapp, 'www', 'js', 'index.js').toLowerCase());
       pathTransformer.getClientPath('file:///android_asset/www/js/merged.js').toLowerCase().should.equal(path.resolve(testapp, 'merges', 'android', 'js', 'merged.js').toLowerCase());
   });
});
