import { Test, type TestingModule } from '@nestjs/testing';

import { DatabaseTestModule } from '../../../test/utils/index.js';
import { AuthenticationModule } from './authentication.module.js';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';

describe('AuthenticationModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [AuthenticationModule, CommonTestModule, DatabaseTestModule.forRoot()],
            providers: [],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });
});
