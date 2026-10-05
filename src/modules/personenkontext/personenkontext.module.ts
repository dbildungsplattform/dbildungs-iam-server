import { forwardRef, Module } from '@nestjs/common';
import { EventModule } from '../../core/eventbus/index.js';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { EmailMicroserviceModule } from '../email-microservice/email-microservice.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { PermissionModule } from '../permission/permission.module.js';
import { EntityAggregateMapper } from '../person/mapper/entity-aggregate.mapper.js';
import { PersonModule } from '../person/person.module.js';
import { PersonenkontextService } from '../personenkontext/domain/personenkontext.service.js';
import { RolleModule } from '../rolle/rolle.module.js';
import { DbiamPersonenkontextFactory } from './domain/dbiam-personenkontext.factory.js';
import { DBiamPersonenkontextService } from './domain/dbiam-personenkontext.service.js';
import { PersonenkontextCreationService } from './domain/personenkontext-creation.service.js';
import { PersonenkontextWorkflowSharedKernel } from './domain/personenkontext-workflow-shared-kernel.js';
import { PersonenkontextWorkflowFactory } from './domain/personenkontext-workflow.factory.js';
import { PersonenkontextFactory } from './domain/personenkontext.factory.js';
import { DBiamPersonenkontextRepo } from './persistence/dbiam-personenkontext.repo.js';
import { DBiamPersonenkontextRepoInternal } from './persistence/internal-dbiam-personenkontext.repo.js';

@Module({
    imports: [
        EventModule,
        forwardRef(() => EmailMicroserviceModule),
        forwardRef(() => PersonModule),
        forwardRef(() => RolleModule),
        OrganisationModule,
        LoggerModule.register(PersonenKontextModule.name),
        forwardRef(() => PermissionModule),
    ],
    providers: [
        PersonenkontextService,
        DBiamPersonenkontextService,
        DBiamPersonenkontextRepo,
        DBiamPersonenkontextRepoInternal,
        DbiamPersonenkontextFactory,
        PersonenkontextFactory,
        PersonenkontextCreationService,
        PersonenkontextWorkflowFactory,
        EntityAggregateMapper,
        PersonenkontextWorkflowSharedKernel,
    ],
    exports: [
        PersonenkontextService,
        DBiamPersonenkontextService,
        DBiamPersonenkontextRepo,
        DbiamPersonenkontextFactory,
        DBiamPersonenkontextRepoInternal, // TODO: Needed by seeding
        PersonenkontextFactory,
        PersonenkontextCreationService,
        PersonenkontextWorkflowFactory,
        PersonenkontextWorkflowSharedKernel,
    ],
})
export class PersonenKontextModule {}
