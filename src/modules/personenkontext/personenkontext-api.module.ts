import { Module } from '@nestjs/common';
import { EventModule } from '../../core/eventbus/index.js';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { PersonApiMapper } from '../person/mapper/person-api.mapper.js';
import { PersonLandesbediensteterSearchModule } from '../person/person-landesbedienstete-search/person-landesbediensteter-search.module.js';
import { PersonModule } from '../person/person.module.js';
import { RolleModule } from '../rolle/rolle.module.js';
import { DbiamPersonenkontextWorkflowController } from './api/dbiam-personenkontext-workflow.controller.js';
import { PersonenkontextController } from './api/personenkontext.controller.js';
import { LandesbediensteteKontextWorkflowService } from './domain/landesbedienstete-kontext-workflow.service.js';
import { PersonenKontextModule } from './personenkontext.module.js';

@Module({
    imports: [
        PersonenKontextModule,
        EventModule,
        PersonModule,
        RolleModule,
        OrganisationModule,
        LoggerModule.register(PersonenKontextApiModule.name),
        PersonLandesbediensteterSearchModule,
    ],
    providers: [PersonApiMapper, LandesbediensteteKontextWorkflowService],
    controllers: [DbiamPersonenkontextWorkflowController, PersonenkontextController],
})
export class PersonenKontextApiModule {}
