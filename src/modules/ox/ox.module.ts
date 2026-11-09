import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { LoggerModule } from '../../core/logging/logger.module.js';
import { EmailMicroserviceModule } from '../email-microservice/email-microservice.module.js';
import { EmailPersistenceModule } from '../email/email-persistence.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { PersonModule } from '../person/person.module.js';
import { PersonenKontextModule } from '../personenkontext/personenkontext.module.js';
import { RolleModule } from '../rolle/rolle.module.js';
import { OxAdapter } from './adapter/domain/ox.adapter.js';
import { OxSendService } from './adapter/technical/ox.send-service.js';
import { OxEventHandler } from './domain/ox-event-handler.js';
import { OxSyncEventHandler } from './domain/ox-sync-event-handler.js';

@Module({
    imports: [
        OrganisationModule,
        RolleModule,
        PersonModule,
        PersonenKontextModule,
        LoggerModule.register(OxModule.name),
        HttpModule,
        EmailMicroserviceModule,
        EmailPersistenceModule,
    ],
    providers: [OxSendService, OxAdapter, OxEventHandler, OxSyncEventHandler],
    exports: [OxSendService, OxAdapter],
})
export class OxModule {}
