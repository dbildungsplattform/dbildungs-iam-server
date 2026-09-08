import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../modules/authentication/api/public.decorator.js';
import { DatabaseHealthIndicator } from '../../../modules/health/database.health-indicator.js';

@Controller('health')
@ApiExcludeController()
export class EmailHealthController {
    public constructor(
        private readonly health: HealthCheckService,
        private readonly databse: DatabaseHealthIndicator,
    ) {}

    @Get()
    @Public()
    @HealthCheck()
    public async check(): Promise<HealthCheckResult> {
        return this.health.check([(): Promise<HealthIndicatorResult> => this.databse.check()]);
    }
}
