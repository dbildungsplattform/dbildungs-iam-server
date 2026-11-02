import { type MockedObject } from 'vitest';
import { LandesbediensteterWorkflowAggregate } from '../../src/modules/landesbediensteter/domain/landesbediensteter-workflow.js';
import { OrganisationRepository } from '../../src/modules/organisation/persistence/organisation.repository.js';
import { PersonRepository } from '../../src/modules/person/persistence/person.repository.js';
import { PersonLandesbediensteterSearchService } from '../../src/modules/person/person-landesbedienstete-search/person-landesbediensteter-search.service.js';
import { DbiamPersonenkontextFactory } from '../../src/modules/personenkontext/domain/dbiam-personenkontext.factory.js';
import { PersonenkontextWorkflowSharedKernel } from '../../src/modules/personenkontext/domain/personenkontext-workflow-shared-kernel.js';
import { DBiamPersonenkontextRepo } from '../../src/modules/personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RolleRepo } from '../../src/modules/rolle/repo/rolle.repo.js';
import { createMock } from './createMock.js';
import { type EventRoutingLegacyKafkaService } from '../../src/core/eventbus/services/event-routing-legacy-kafka.service.js';
import { type ClassLogger } from '../../src/core/logging/class-logger.js';
import { type DbiamPersonenkontextBodyParams } from '../../src/modules/personenkontext/api/param/dbiam-personenkontext.body.params.js';
import { type PersonenkontextFactory } from '../../src/modules/personenkontext/domain/personenkontext.factory.js';
import { PersonenkontexteUpdate } from '../../src/modules/personenkontext/domain/personenkontexte-update.js';
import { type DBiamPersonenkontextRepoInternal } from '../../src/modules/personenkontext/persistence/internal-dbiam-personenkontext.repo.js';
import { type IPersonPermissions } from '../../src/shared/permissions/person-permissions.interface.js';
import { type PersonID } from '../../src/shared/types/index.js';
import { EscalatedPersonPermissionsFactory } from '../../src/modules/permission/escalated-person-permissions.factory.js';
import { type EmailResolverService } from '../../src/modules/email-microservice/domain/email-resolver.service.js';

export function createLandesbediensteterWorkflowAggregateMock(): MockedObject<LandesbediensteterWorkflowAggregate> {
    const landesbediensteterWorkflowAggregate: LandesbediensteterWorkflowAggregate =
        LandesbediensteterWorkflowAggregate.createNew(
            createMock(RolleRepo),
            createMock(OrganisationRepository),
            createMock(DBiamPersonenkontextRepo),
            createMock(DbiamPersonenkontextFactory),
            createMock(PersonRepository),
            createMock(PersonLandesbediensteterSearchService),
            createMock(PersonenkontextWorkflowSharedKernel),
            createMock(EscalatedPersonPermissionsFactory),
        );
    return vi.mockObject(landesbediensteterWorkflowAggregate);
}
export function createPersonenkontexteUpdateMock(): MockedObject<PersonenkontexteUpdate> {
    const personenkontexteUpdate: PersonenkontexteUpdate = PersonenkontexteUpdate.createNew(
        null as unknown as EventRoutingLegacyKafkaService,
        null as unknown as ClassLogger,
        null as unknown as DBiamPersonenkontextRepo,
        null as unknown as DBiamPersonenkontextRepoInternal,
        null as unknown as PersonRepository,
        null as unknown as RolleRepo,
        null as unknown as OrganisationRepository,
        null as unknown as PersonenkontextFactory,
        null as unknown as PersonID,
        null as unknown as Date | undefined,
        null as unknown as number,
        null as unknown as DbiamPersonenkontextBodyParams[],
        null as unknown as IPersonPermissions,
        null as unknown as EmailResolverService,
    );
    return vi.mockObject(personenkontexteUpdate);
}
