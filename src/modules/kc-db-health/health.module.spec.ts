import { Test, type TestingModule } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { HealthModule } from './health.module.js';
import { HealthController } from './health.controller.js';

describe('HealthModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [HealthModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    it('should import TerminusModule', () => {
        const terminusModule: TerminusModule = module.get(TerminusModule);
        expect(terminusModule).toBeDefined();
    });

    it('should have HealthController', () => {
        const healthController: HealthController = module.get(HealthController);
        expect(healthController).toBeDefined();
    });
});
