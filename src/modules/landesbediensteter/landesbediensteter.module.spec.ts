import { Test, type TestingModule } from '@nestjs/testing';

import { DatabaseTestModule } from '../../../test/utils/index.js';
import { EventModule } from '../../core/eventbus/index.js';
import { LandesbediensteterController } from './api/landesbediensteter.controller.js';
import { LandesbediensteterWorkflowFactory } from './domain/landesbediensteter-workflow.factory.js';
import { LandesbediensteterModule } from './landesbediensteter.module.js';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';

describe('LandesbediensteterModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LandesbediensteterModule, CommonTestModule, DatabaseTestModule.forRoot(), EventModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve LandesbediensteteWorkflowFactory', () => {
            expect(module.get(LandesbediensteterWorkflowFactory)).toBeInstanceOf(LandesbediensteterWorkflowFactory);
        });

        it('should resolve LandesbediensteteController', () => {
            expect(module.get(LandesbediensteterController)).toBeInstanceOf(LandesbediensteterController);
        });
    });
});
