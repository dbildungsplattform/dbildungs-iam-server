import { Test, type TestingModule } from '@nestjs/testing';
import { RolleRepo } from './repo/rolle.repo.js';
import { RolleModule } from './rolle.module.js';
import { ConfigTestModule } from '../../../test/utils/config-test.module.js';
import { DatabaseTestModule } from '../../../test/utils/database-test.module.js';

describe('RolleModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot(), RolleModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve RolleRepo', () => {
            expect(module.get(RolleRepo)).toBeInstanceOf(RolleRepo);
        });
    });
});
