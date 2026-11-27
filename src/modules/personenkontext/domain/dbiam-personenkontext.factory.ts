import { Injectable } from '@nestjs/common';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DBiamPersonenkontextRepoInternal } from '../persistence/internal-dbiam-personenkontext.repo.js';
import { PersonenkontexteUpdate } from './personenkontexte-update.js';
import { DbiamPersonenkontextBodyParams } from '../api/param/dbiam-personenkontext.body.params.js';
import { PersonID } from '../../../shared/types/index.js';
import { PersonenkontextFactory } from './personenkontext.factory.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { RoleOrganisationAssignmentValidator } from './role-organisation-assignment.validator.js';

@Injectable()
export class DbiamPersonenkontextFactory {
    public constructor(
        private personenkontextFactory: PersonenkontextFactory,
        private readonly eventRoutingLegacyKafkaService: EventRoutingLegacyKafkaService,
        private readonly logger: ClassLogger,
        private readonly dBiamPersonenkontextRepo: DBiamPersonenkontextRepo,
        private readonly dBiamPersonenkontextRepoInternal: DBiamPersonenkontextRepoInternal,
        private readonly personRepo: PersonRepository,
        private readonly rolleRepo: RolleRepo,
        private readonly organisationRepo: OrganisationRepository,
        private readonly emailResolverService: EmailResolverService,
        private readonly roleOrganisationValidator: RoleOrganisationAssignmentValidator,
    ) {}

    public createNewPersonenkontexteUpdate(
        personId: PersonID,
        lastModified: Date | undefined,
        count: number,
        dBiamPersonenkontextBodyParams: DbiamPersonenkontextBodyParams[],
        permissions: IPersonPermissions,
        personalnummer?: string,
    ): PersonenkontexteUpdate {
        return PersonenkontexteUpdate.createNew(
            this.eventRoutingLegacyKafkaService,
            this.logger,
            this.dBiamPersonenkontextRepo,
            this.dBiamPersonenkontextRepoInternal,
            this.personRepo,
            this.rolleRepo,
            this.organisationRepo,
            this.personenkontextFactory,
            personId,
            lastModified,
            count,
            dBiamPersonenkontextBodyParams,
            permissions,
            this.emailResolverService,
            this.roleOrganisationValidator,
            personalnummer,
        );
    }
}
