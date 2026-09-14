import { Module } from '@nestjs/common';
import { EventModule } from '../../core/eventbus/index.js';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { PersonApiMapper } from '../person/mapper/person-api.mapper.js';
import { PersonModule } from '../person/person.module.js';
import { RolleModule } from '../rolle/rolle.module.js';
import { DbiamPersonenkontextWorkflowController } from './api/dbiam-personenkontext-workflow.controller.js';
import { PersonAdministrationController } from './api/person-administration.controller.js';
import { PersonAdministrationService } from './domain/person-administration.service.js';
import { PersonenKontextModule } from './personenkontext.module.js';

@Module({
    imports: [
        PersonenKontextModule,
        EventModule,
        PersonModule,
        RolleModule,
        OrganisationModule,
        LoggerModule.register(PersonenKontextApiModule.name),
    ],
    providers: [PersonAdministrationService, PersonApiMapper],
    controllers: [DbiamPersonenkontextWorkflowController, PersonAdministrationController],
})
export class PersonenKontextApiModule {}
