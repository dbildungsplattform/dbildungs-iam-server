import { Test, type TestingModule } from '@nestjs/testing';
import { PersonLandesbediensteterSearchModule } from './person-landesbediensteter-search.module.js';
import { CommonTestModule, DatabaseTestModule } from '../../../../test/utils/index.js';

describe('PersonLandesbediensteterSearchModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot(), PersonLandesbediensteterSearchModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });
});
