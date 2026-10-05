import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { EmailPersistenceModule } from '../email/email-persistence.module.js';
import { PersonModule } from '../person/person.module.js';
import { PersonenKontextModule } from '../personenkontext/personenkontext.module.js';
import { RolleModule } from '../rolle/rolle.module.js';
import { EmailWebhookController } from './api/email-microservice-webhook.controller.js';
import { EmailMicroserviceEventHandler } from './domain/email-microservice-event-handler.js';
import { EmailResolverService } from './domain/email-resolver.service.js';

@Module({
    imports: [
        HttpModule,
        forwardRef(() => RolleModule),
        EmailPersistenceModule,
        forwardRef(() => PersonenKontextModule),
        forwardRef(() => PersonModule),
        LoggerModule.register(EmailMicroserviceModule.name),
    ],
    controllers: [EmailWebhookController],
    providers: [EmailResolverService, EmailMicroserviceEventHandler],
    exports: [EmailResolverService],
})
export class EmailMicroserviceModule {}
