import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { EscalatedPersonPermissionsFactory } from '../../permission/escalated-person-permissions.factory.js';
import { PersonLandesbediensteterSearchService } from '../../person/person-landesbedienstete-search/person-landesbediensteter-search.service.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DbiamPersonenkontextFactory } from './dbiam-personenkontext.factory.js';
import { PersonenkontextWorkflowAggregate } from './personenkontext-workflow.js';

@Injectable()
export class PersonenkontextWorkflowFactory {
    public constructor(
        private readonly rolleRepo: RolleRepo,
        private readonly organisationRepository: OrganisationRepository,
        private readonly dbiamPersonenkontextFactory: DbiamPersonenkontextFactory,
        private readonly configService: ConfigService,
        private readonly escalatedPersonPermissionsFactory: EscalatedPersonPermissionsFactory,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly landesbediensteteSearchService: PersonLandesbediensteterSearchService,
    ) {}

    public createNew(): PersonenkontextWorkflowAggregate {
        return PersonenkontextWorkflowAggregate.createNew(
            this.rolleRepo,
            this.organisationRepository,
            this.dbiamPersonenkontextFactory,
            this.configService,
            this.escalatedPersonPermissionsFactory,
            this.personenkontextRepo,
            this.landesbediensteteSearchService,
        );
    }
}
