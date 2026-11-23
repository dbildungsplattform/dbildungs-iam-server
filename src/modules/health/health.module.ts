import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { DatabaseHealthIndicator } from './database.health-indicator.js';
import { HealthController } from './health.controller.js';
import { RedisHealthIndicator } from './redis.health-indicator.js';

@Module({
    imports: [TerminusModule, LoggerModule.register(HealthModule.name)],
    providers: [RedisHealthIndicator, DatabaseHealthIndicator],
    controllers: [HealthController],
})
export class HealthModule {}
