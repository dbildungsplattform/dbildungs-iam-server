import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { EmailHealthController } from './email-health.controller.js';
import { LoggerModule } from '../../../core/logging/logger.module.js';
import { HttpModule } from '@nestjs/axios';
import { DatabaseHealthIndicator } from '../../../modules/health/database.health-indicator.js';

@Module({
    imports: [TerminusModule, HttpModule, LoggerModule.register(EmailHealthModule.name)],
    providers: [DatabaseHealthIndicator],
    controllers: [EmailHealthController],
})
export class EmailHealthModule {}
