import { HealthCheckService, type HealthIndicatorFunction } from '@nestjs/terminus';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '../../../test/utils/createMock.js';
import { DatabaseHealthIndicator } from './database.health-indicator.js';
import { HealthController } from './health.controller.js';
import { RedisHealthIndicator } from './redis.health-indicator.js';

describe('HealthController', () => {
    let controller: HealthController;

    let healthCheckService: DeepMocked<HealthCheckService>;
    let databaseHealthIndicator: DeepMocked<DatabaseHealthIndicator>;
    let redisHealthIndicator: RedisHealthIndicator;

    beforeEach(async () => {
        healthCheckService = createMock(HealthCheckService);
        redisHealthIndicator = createMock(RedisHealthIndicator);
        databaseHealthIndicator = createMock(DatabaseHealthIndicator);

        const module: TestingModule = await Test.createTestingModule({
            controllers: [HealthController],
            providers: [
                { provide: HealthCheckService, useValue: healthCheckService },
                { provide: RedisHealthIndicator, useValue: redisHealthIndicator },
                { provide: DatabaseHealthIndicator, useValue: databaseHealthIndicator },
            ],
        }).compile();

        controller = module.get<HealthController>(HealthController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    it('should only perform database and Redis health checks', async () => {
        await controller.check();

        expect(healthCheckService.check).toHaveBeenCalled();
        const lastCallArguments: HealthIndicatorFunction[] | undefined = healthCheckService.check.mock.lastCall?.[0];
        expect(lastCallArguments).toHaveLength(2);

        if (lastCallArguments) {
            // eslint-disable-next-line @typescript-eslint/await-thenable
            await Promise.all(lastCallArguments.map((hif: HealthIndicatorFunction) => hif.call(hif)));
        }
        expect(redisHealthIndicator.check).toHaveBeenCalled();
        expect(databaseHealthIndicator.check).toHaveBeenCalled();
    });
});
