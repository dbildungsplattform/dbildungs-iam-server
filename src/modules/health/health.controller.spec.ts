import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthCheckService, HealthIndicatorFunction, HttpHealthIndicator } from '@nestjs/terminus';
import { createMock, DeepMocked } from '../../../test/utils/createMock.js';
import { ConfigService } from '@nestjs/config';
import { KeycloakConfig } from '../../shared/config/index.js';
import { KeycloakHealthIndicator } from './keycloak.health-indicator.js';
import { RedisHealthIndicator } from './redis.health-indicator.js';
import { DatabaseHealthIndicator } from './database.health-indicator.js';

describe('HealthController', () => {
    let controller: HealthController;

    let healthCheckService: DeepMocked<HealthCheckService>;
    let httpHealthIndicator: DeepMocked<HttpHealthIndicator>;
    let keycloakHealthIndicator: DeepMocked<KeycloakHealthIndicator>;
    let databaseHealthIndicator: DeepMocked<DatabaseHealthIndicator>;
    const keycloakConfig: KeycloakConfig = {
        ADMIN_CLIENT_ID: '',
        ADMIN_SECRET: '',
        ADMIN_REALM_NAME: '',
        BASE_URL: 'http://keycloak.test',
        EXTERNAL_BASE_URL: 'http://keycloak.test',
        REALM_NAME: '',
        CLIENT_ID: '',
        CLIENT_SECRET: '',
        TEST_CLIENT_ID: '',
        SERVICE_CLIENT_ID: '',
        SERVICE_CLIENT_PRIVATE_JWKS: '',
    };
    let redisHealthIndicator: RedisHealthIndicator;
    let configService: DeepMocked<ConfigService>;

    beforeEach(async () => {
        healthCheckService = createMock(HealthCheckService);
        httpHealthIndicator = createMock(HttpHealthIndicator);
        configService = createMock(ConfigService);
        keycloakHealthIndicator = createMock(KeycloakHealthIndicator);
        redisHealthIndicator = createMock(RedisHealthIndicator);
        databaseHealthIndicator = createMock(DatabaseHealthIndicator);

        configService.getOrThrow.mockReturnValue(keycloakConfig);

        const module: TestingModule = await Test.createTestingModule({
            controllers: [HealthController],
            providers: [
                { provide: HealthCheckService, useValue: healthCheckService },
                { provide: HttpHealthIndicator, useValue: httpHealthIndicator },
                { provide: KeycloakConfig, useValue: keycloakConfig },
                { provide: ConfigService, useValue: configService },
                { provide: KeycloakHealthIndicator, useValue: keycloakHealthIndicator },
                { provide: RedisHealthIndicator, useValue: redisHealthIndicator },
                { provide: DatabaseHealthIndicator, useValue: databaseHealthIndicator },
            ],
        }).compile();

        controller = module.get<HealthController>(HealthController);
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
        expect(keycloakHealthIndicator.check).toHaveBeenCalled();
        expect(redisHealthIndicator.check).toHaveBeenCalled();
        expect(databaseHealthIndicator.check).toHaveBeenCalled();
    });
});
