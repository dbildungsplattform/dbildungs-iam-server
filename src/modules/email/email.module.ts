import { Module } from '@nestjs/common';
import { EventModule } from '../../core/eventbus/event.module.js';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { PersonModule } from '../person/person.module.js';
import { EmailEventHandler } from './domain/email-event-handler.js';
import { EmailFactory } from './domain/email.factory.js';
import { EmailPersistenceModule } from './email-persistence.module.js';

@Module({
    imports: [
        OrganisationModule,
        PersonModule,
        EventModule,
        EmailPersistenceModule,
        LoggerModule.register(EmailModule.name),
    ],
    providers: [EmailFactory, EmailEventHandler],
})
export class EmailModule {}
