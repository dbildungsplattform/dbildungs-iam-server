import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { ApiExcludeController } from '@nestjs/swagger';
import { KeycloakHealthIndicator } from './keycloak.health-indicator.js';
import { RedisHealthIndicator } from './redis.health-indicator.js';
import { Public } from '../authentication/api/public.decorator.js';
import { DatabaseHealthIndicator } from './database.health-indicator.js';

@Controller('health')
@ApiExcludeController()
export class HealthController {
    public constructor(
        private health: HealthCheckService,
        private keycloak: KeycloakHealthIndicator,
        private redis: RedisHealthIndicator,
        private databse: DatabaseHealthIndicator,
    ) {}

    @Get()
    @Public()
    @HealthCheck()
    public check(): Promise<HealthCheckResult> {
        return this.health.check([
            (): Promise<HealthIndicatorResult> => this.keycloak.check(),
            (): Promise<HealthIndicatorResult> => this.redis.check(),
            (): Promise<HealthIndicatorResult> => this.databse.check(),
        ]);
    }
}
