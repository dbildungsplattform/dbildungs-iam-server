import { Test, type TestingModule } from '@nestjs/testing';
import { MeldungRepo } from './persistence/meldung.repo.js';
import { MeldungModule } from './meldung.module.js';
import { LoggingTestModule } from '../../../test/utils/logging-test.module.js';
import { ConfigTestModule } from '../../../test/utils/config-test.module.js';
import { DatabaseTestModule } from '../../../test/utils/database-test.module.js';

describe('MeldungModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, LoggingTestModule, DatabaseTestModule.forRoot(), MeldungModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve MeldungRepo', () => {
            expect(module.get(MeldungRepo)).toBeInstanceOf(MeldungRepo);
        });
    });
});
