import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { PersonenKontextModule } from '../personenkontext/personenkontext.module.js';
import { RolleModule } from '../rolle/rolle.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { PersonenInfoController } from './api/personeninfo/personeninfo.controller.js';
import { PersonInfoController } from './api/personinfo/person-info.controller.js';
import { PersonenInfoService } from './domain/personeninfo/personeninfo.service.js';
import { PersonModule } from '../person/person.module.js';
import { KeycloakAdministrationModule } from '../keycloak-administration/keycloak-administration.module.js';
import { SchulconnexRepo } from './persistence/schulconnex.repo.js';
import { SchulconnexPushRegistryRepo } from './persistence/schulconnex-push-registry.repo.js';
import { EntityAggregateMapper } from '../person/mapper/entity-aggregate.mapper.js';
import { EmailMicroserviceModule } from '../email-microservice/email-microservice.module.js';
import { EmailPersistenceModule } from '../email/email-persistence.module.js';
import { SchulconnexPushAdapter } from './adapter/domain/schulconnex-push.adapter.js';
import { SchulconnexPushApiClient } from './adapter/technical/schulconnex-push-api.client.js';

@Module({
    imports: [
        HttpModule,
        PersonModule,
        RolleModule,
        OrganisationModule,
        PersonenKontextModule,
        KeycloakAdministrationModule,
        EmailMicroserviceModule,
        EmailPersistenceModule,
        LoggerModule.register(SchulconnexModule.name),
    ],
    providers: [
        PersonenInfoService,
        SchulconnexRepo,
        EntityAggregateMapper,
        SchulconnexPushRegistryRepo,
        SchulconnexPushApiClient,
        SchulconnexPushAdapter,
    ],
    controllers: [PersonInfoController, PersonenInfoController],
})
export class SchulconnexModule {}
