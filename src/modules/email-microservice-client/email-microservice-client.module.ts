import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { EmailResolverService } from './domain/email-resolver.service.js';

@Module({
    imports: [HttpModule, LoggerModule.register(EmailMicroserviceClientModule.name)],
    providers: [EmailResolverService],
    exports: [EmailResolverService],
})
export class EmailMicroserviceClientModule {}
