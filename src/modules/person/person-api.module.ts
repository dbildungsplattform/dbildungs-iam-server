import { Module } from '@nestjs/common';
import { LoggerModule } from '../../core/logging/logger.module.js';

import { LdapModule } from '../../core/ldap/ldap.module.js';
import { EmailMicroserviceModule } from '../email-microservice/email-microservice.module.js';
import { KeycloakAdministrationModule } from '../keycloak-administration/keycloak-administration.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { PersonenKontextModule } from '../personenkontext/personenkontext.module.js';
import { RolleModule } from '../rolle/rolle.module.js';
import { PersonController } from './api/person.controller.js';
import { PersonFrontendController } from './api/person.frontend.controller.js';
import { DBiamPersonenuebersichtController } from './api/personenuebersicht/dbiam-personenuebersicht.controller.js';
import { PersonApiMapper } from './mapper/person-api.mapper.js';
import { PersonDeleteModule } from './person-deletion/person-delete.module.js';
import { PersonLandesbediensteterSearchModule } from './person-landesbedienstete-search/person-landesbediensteter-search.module.js';
import { PersonModule } from './person.module.js';

@Module({
    imports: [
        PersonModule,
        LdapModule,
        RolleModule,
        OrganisationModule,
        PersonenKontextModule,
        PersonDeleteModule,
        PersonLandesbediensteterSearchModule,
        KeycloakAdministrationModule,
        EmailMicroserviceModule,
        LoggerModule.register(PersonApiModule.name),
    ],
    providers: [PersonApiMapper],
    controllers: [PersonController, PersonFrontendController, DBiamPersonenuebersichtController],
})
export class PersonApiModule {}
