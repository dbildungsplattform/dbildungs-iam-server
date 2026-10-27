import { Injectable } from '@nestjs/common';

import { DomainError } from '../../../../shared/error/index.js';
import { PersonID, PersonenkontextID } from '../../../../shared/types/aggregate-ids.types.js';
import { UserLock } from '../../../keycloak-administration/domain/user-lock.js';
import { PersonEmailResponse } from '../../../person/api/person-email-response.js';
import { Person } from '../../../person/domain/person.js';
import { KontextWithOrgaAndRolle } from '../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonInfoKontextDtoV2 } from '../../api/personinfo/v2/person-info-kontext.response.v2.js';
import { PersonInfoPersonDtoV2 } from '../../api/personinfo/v2/person-info-person.response.v2.js';
import { SchulconnexMapper } from '../../api/schulconnex-mapper.js';
import { SchulconnexPushRegistry } from '../../domain/schulconnex-push-registry.js';
import { SchulconnexPushApiClient } from '../technical/schulconnex-push-api.client.js';

@Injectable()
export class SchulconnexPushAdapter {
    public constructor(private readonly client: SchulconnexPushApiClient) {}

    public async upsertPerson(
        registry: SchulconnexPushRegistry<true>,
        person: Person<true>,
    ): Promise<Result<void, DomainError>> {
        const personDto: PersonInfoPersonDtoV2 = SchulconnexMapper.mapPerson(person);

        return this.client.upsertPerson(registry, person.id, personDto);
    }

    public async deletePerson(
        registry: SchulconnexPushRegistry<true>,
        personId: PersonID,
    ): Promise<Result<void, DomainError>> {
        return this.client.deletePerson(registry, personId);
    }

    /**
     * Groups (Klassen) are not part of the push API and are therefore not mapped.
     */
    public async upsertPersonenkontext(
        registry: SchulconnexPushRegistry<true>,
        kontext: KontextWithOrgaAndRolle,
        userlocks: UserLock[],
        email: Option<PersonEmailResponse>,
    ): Promise<Result<void, DomainError>> {
        const kontextDto: PersonInfoKontextDtoV2 = SchulconnexMapper.mapKontext(
            kontext,
            [],
            userlocks,
            email ?? undefined,
        );

        return this.client.upsertPersonenkontext(registry, kontext.personenkontext.personId, kontextDto);
    }

    public async deletePersonenkontext(
        registry: SchulconnexPushRegistry<true>,
        personId: PersonID,
        personenkontextId: PersonenkontextID,
    ): Promise<Result<void, DomainError>> {
        return this.client.deletePersonenkontext(registry, personId, personenkontextId);
    }
}
