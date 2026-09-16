import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseTestModule } from '../../../test/utils/index.js';
import { PersonenKontextModule } from './personenkontext.module.js';
import { PersonenkontextService } from './domain/personenkontext.service.js';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';

describe('PersonKontextModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot(), PersonenKontextModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve PersonenkontextService', () => {
            expect(module.get(PersonenkontextService)).toBeInstanceOf(PersonenkontextService);
        });
    });
});
