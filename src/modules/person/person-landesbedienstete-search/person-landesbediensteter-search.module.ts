import { Module } from '@nestjs/common';
import { LoggerModule } from '../../../core/logging/logger.module.js';
import { EmailMicroserviceClientModule } from '../../email-microservice-client/email-microservice-client.module.js';
import { KeycloakAdministrationModule } from '../../keycloak-administration/keycloak-administration.module.js';
import { PersonenKontextModule } from '../../personenkontext/personenkontext.module.js';
import { PersonModule } from '../person.module.js';
import { PersonLandesbediensteterSearchService } from './person-landesbediensteter-search.service.js';

@Module({
    imports: [
        PersonModule,
        PersonenKontextModule,
        KeycloakAdministrationModule,
        EmailMicroserviceClientModule,
        LoggerModule.register(PersonLandesbediensteterSearchModule.name),
    ],
    providers: [PersonLandesbediensteterSearchService],
    exports: [PersonLandesbediensteterSearchService],
})
export class PersonLandesbediensteterSearchModule {}
