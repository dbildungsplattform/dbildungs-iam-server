import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, HealthIndicatorFunction } from '@nestjs/terminus';
import { EmailHealthController } from './email-health.controller.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DatabaseHealthIndicator } from '../../../modules/health/database.health-indicator.js';

describe('EmailHealthController', () => {
    let controller: EmailHealthController;
    let healthCheckService: DeepMocked<HealthCheckService>;
    let databaseHealthIndicator: DeepMocked<DatabaseHealthIndicator>;

    beforeAll(async () => {
        healthCheckService = createMock(HealthCheckService);
        databaseHealthIndicator = createMock(DatabaseHealthIndicator);

        const module: TestingModule = await Test.createTestingModule({
            controllers: [EmailHealthController],
            providers: [
                { provide: HealthCheckService, useValue: healthCheckService },
                { provide: DatabaseHealthIndicator, useValue: databaseHealthIndicator },
            ],
        }).compile();

        controller = module.get<EmailHealthController>(EmailHealthController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    it('should Perform all health checks', async () => {
        await controller.check();

        expect(healthCheckService.check).toHaveBeenCalled();
        const lastCallArguments: HealthIndicatorFunction[] | undefined = healthCheckService.check.mock.lastCall?.[0];
        expect(lastCallArguments).toBeDefined();

        if (lastCallArguments) {
            // eslint-disable-next-line @typescript-eslint/await-thenable
            await Promise.all(lastCallArguments.map((hif: HealthIndicatorFunction) => hif.call(hif)));
        }
        expect(databaseHealthIndicator.check).toHaveBeenCalled();
    });
});
