import { type MockedObject } from 'vitest';
import { type EventRoutingLegacyKafkaService } from '../../src/core/eventbus/services/event-routing-legacy-kafka.service.js';
import { type ClassLogger } from '../../src/core/logging/class-logger.js';
import { type EmailResolverService } from '../../src/modules/email-resolver/domain/email-resolver.service.js';
import { type OrganisationRepository } from '../../src/modules/organisation/persistence/organisation.repository.js';
import { type PersonRepository } from '../../src/modules/person/persistence/person.repository.js';
import { type DbiamPersonenkontextBodyParams } from '../../src/modules/personenkontext/api/param/dbiam-personenkontext.body.params.js';
import { type PersonenkontextFactory } from '../../src/modules/personenkontext/domain/personenkontext.factory.js';
import { PersonenkontexteUpdate } from '../../src/modules/personenkontext/domain/personenkontexte-update.js';
import { type DBiamPersonenkontextRepo } from '../../src/modules/personenkontext/persistence/dbiam-personenkontext.repo.js';
import { type DBiamPersonenkontextRepoInternal } from '../../src/modules/personenkontext/persistence/internal-dbiam-personenkontext.repo.js';
import { type RolleRepo } from '../../src/modules/rolle/repo/rolle.repo.js';
import { type IPersonPermissions } from '../../src/shared/permissions/person-permissions.interface.js';
import { type PersonID } from '../../src/shared/types/index.js';

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
