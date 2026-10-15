import { type TestingModule, Test } from '@nestjs/testing';
import { DatabaseTestModule } from '../../../test/utils/index.js';
import { ImportWorkflowFactory } from './domain/import-workflow.factory.js';
import { ImportDataRepository } from './persistence/import-data.repository.js';
import { ImportModule } from './import.module.js';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';

describe('ImportModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot(), ImportModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve ImportWorkflowFactory', () => {
            expect(module.get(ImportWorkflowFactory)).toBeInstanceOf(ImportWorkflowFactory);
        });

        it('should resolve ImportDataRepository', () => {
            expect(module.get(ImportDataRepository)).toBeInstanceOf(ImportDataRepository);
        });
    });
});
