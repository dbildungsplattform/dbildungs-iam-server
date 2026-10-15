import { Test, type TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { TerminusModule } from '@nestjs/terminus';

describe('HealthController', () => {
    let controller: HealthController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [TerminusModule],
            controllers: [HealthController],
        }).compile();

        controller = module.get<HealthController>(HealthController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    it('should return an object with status UP', () => {
        expect(controller.check()).not.toBeNull();
    });
});
