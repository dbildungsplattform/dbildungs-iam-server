import { EntityManager, RequiredEntityData } from '@mikro-orm/core';
import { faker } from '@faker-js/faker';

import { OrganisationsTyp } from '../../src/modules/organisation/domain/organisation.enums.js';
import { OrganisationEntity } from '../../src/modules/organisation/persistence/organisation.entity.js';
import { OrganisationRepository } from '../../src/modules/organisation/persistence/organisation.repository.js';
import { OrganisationID } from '../../src/shared/types/index.js';

export async function createAndPersistRootOrganisation(
    em: EntityManager,
    organisationRepository: OrganisationRepository,
): Promise<OrganisationEntity> {
    const organisationData: RequiredEntityData<OrganisationEntity> = {
        id: organisationRepository.ROOT_ORGANISATION_ID,
        name: 'Root',
        typ: OrganisationsTyp.ROOT,
        itslearningEnabled: false,
    };

    const organisationEntity: OrganisationEntity = em.create(OrganisationEntity, organisationData);
    await em.persist(organisationEntity).flush();

    return organisationEntity;
}

export async function createAndPersistOrganisation(
    em: EntityManager,
    parentOrga: OrganisationID | undefined,
    typ: OrganisationsTyp,
    fakeNames: boolean = true,
): Promise<OrganisationEntity> {
    const organisationData: RequiredEntityData<OrganisationEntity> = {
        administriertVon: parentOrga,
        zugehoerigZu: parentOrga,
        name: fakeNames ? faker.company.name() : 'Testorganisation',
        typ,
        kennung: fakeNames ? faker.lorem.word() : undefined,
        namensergaenzung: fakeNames ? faker.company.name() : undefined,
        kuerzel: fakeNames ? faker.lorem.word() : undefined,
        itslearningEnabled: false,
    };
    const organisationEntity: OrganisationEntity = em.create(OrganisationEntity, organisationData);
    await em.persist(organisationEntity).flush();

    return organisationEntity;
}
