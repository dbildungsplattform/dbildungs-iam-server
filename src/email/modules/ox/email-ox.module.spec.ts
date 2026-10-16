import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseTestModule, EmailConfigTestModule } from '../../../../test/utils/index.js';
import { EmailOxModule } from './email-ox.module.js';
import { OxSendService } from './adapter/technical/ox-send.service.js';

describe('OxModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [EmailConfigTestModule, EmailOxModule, DatabaseTestModule.forRoot()],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve OxService', () => {
            expect(module.get(OxSendService)).toBeInstanceOf(OxSendService);
        });
    });
});
