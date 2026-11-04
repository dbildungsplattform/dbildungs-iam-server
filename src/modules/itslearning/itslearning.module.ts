import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { LoggerModule } from '../../core/logging/logger.module.js';
import { EmailMicroserviceModule } from '../email-microservice/email-microservice.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { PersonModule } from '../person/person.module.js';
import { PersonenKontextModule } from '../personenkontext/personenkontext.module.js';
import { RolleModule } from '../rolle/rolle.module.js';
import { ServiceProviderModule } from '../service-provider/service-provider.module.js';
import { ItslearningGroupAdapter } from './adapter/domain/itslearning-group.adapter.js';
import { ItslearningMembershipAdapter } from './adapter/domain/itslearning-membership.adapter.js';
import { ItslearningPersonAdapter } from './adapter/domain/itslearning-person.adapter.js';
import { ItsLearningIMSESApiService } from './adapter/technical/itslearning.api-service.js';
import { ItsLearningOrganisationsEventHandler } from './event-handlers/itslearning-organisations.event-handler.js';
import { ItsLearningPersonsEventHandler } from './event-handlers/itslearning-persons.event-handler.js';
import { ItsLearningRolleEventHandler } from './event-handlers/itslearning-rolle.event-handler.js';
import { ItsLearningSyncEventHandler } from './event-handlers/itslearning-sync.event-handler.js';

@Module({
    imports: [
        LoggerModule.register(ItsLearningModule.name),
        HttpModule,
        PersonModule,
        RolleModule,
        OrganisationModule,
        PersonenKontextModule,
        ServiceProviderModule,
        EmailMicroserviceModule,
    ],
    providers: [
        ItsLearningIMSESApiService,
        ItslearningPersonAdapter,
        ItslearningGroupAdapter,
        ItslearningMembershipAdapter,
        ItsLearningOrganisationsEventHandler,
        ItsLearningPersonsEventHandler,
        ItsLearningSyncEventHandler,
        ItsLearningRolleEventHandler,
    ],
    exports: [ItsLearningIMSESApiService],
})
export class ItsLearningModule {}
