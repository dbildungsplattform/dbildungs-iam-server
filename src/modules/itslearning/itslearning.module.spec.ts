import { Test, type TestingModule } from '@nestjs/testing';

import { DatabaseTestModule } from '../../../test/utils/index.js';
import { ItsLearningModule } from './itslearning.module.js';
import { ItsLearningIMSESApiService } from './adapter/technical/itslearning.api-service.js';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';

describe('ItsLearningModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, ItsLearningModule, DatabaseTestModule.forRoot()],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve ItsLearningIMSESService', () => {
            expect(module.get(ItsLearningIMSESApiService)).toBeInstanceOf(ItsLearningIMSESApiService);
        });
    });
});
