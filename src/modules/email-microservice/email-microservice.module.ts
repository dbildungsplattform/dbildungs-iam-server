import { Module } from '@nestjs/common';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { EmailMicroserviceClientModule } from '../email-microservice-client/email-microservice-client.module.js';
import { KeycloakAdministrationModule } from '../keycloak-administration/keycloak-administration.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { PersonModule } from '../person/person.module.js';
import { PersonenKontextModule } from '../personenkontext/personenkontext.module.js';
import { RolleModule } from '../rolle/rolle.module.js';
import { EmailWebhookController } from './api/email-microservice-webhook.controller.js';
import { EmailMicroserviceEventHandler } from './domain/email-microservice-event-handler.js';

@Module({
    imports: [
        EmailMicroserviceClientModule,
        OrganisationModule,
        KeycloakAdministrationModule,
        RolleModule,
        PersonenKontextModule,
        PersonModule,
        LoggerModule.register(EmailMicroserviceModule.name),
    ],
    controllers: [EmailWebhookController],
    providers: [EmailMicroserviceEventHandler],
})
export class EmailMicroserviceModule {}
