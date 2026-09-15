import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { DbiamPersonenkontextFactory } from './dbiam-personenkontext.factory.js';
import { PersonenkontextWorkflowSharedKernel } from './personenkontext-workflow-shared-kernel.js';
import { PersonenkontextWorkflowAggregate } from './personenkontext-workflow.js';

@Injectable()
export class PersonenkontextWorkflowFactory {
    public constructor(
        private readonly rolleRepo: RolleRepo,
        private readonly organisationRepository: OrganisationRepository,
        private readonly dbiamPersonenkontextFactory: DbiamPersonenkontextFactory,
        private readonly configService: ConfigService,
        private readonly personenkontextWorkflowSharedKernel: PersonenkontextWorkflowSharedKernel,
    ) {}

    public createNew(): PersonenkontextWorkflowAggregate {
        return PersonenkontextWorkflowAggregate.createNew(
            this.rolleRepo,
            this.organisationRepository,
            this.dbiamPersonenkontextFactory,
            this.configService,
            this.personenkontextWorkflowSharedKernel,
        );
    }
}
