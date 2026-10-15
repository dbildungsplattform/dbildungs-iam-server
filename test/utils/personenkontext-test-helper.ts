import { type EntityManager, type Reference, type RequiredEntityData } from '@mikro-orm/postgresql';
import { PersonenkontextEntity } from '../../src/modules/personenkontext/persistence/personenkontext.entity.js';
import { faker } from '@faker-js/faker';
import {
    Jahrgangsstufe,
    Personenstatus,
    SichtfreigabeType,
} from '../../src/modules/personenkontext/domain/personenkontext.enums.js';
import { type PersonEntity } from '../../src/modules/person/persistence/person.entity.js';
import { type RolleEntity } from '../../src/modules/rolle/entity/rolle.entity.js';
import { type OrganisationEntity } from '../../src/modules/organisation/persistence/organisation.entity.js';

export function createPersonenkontext(
    personId: { id: string } & Reference<PersonEntity & object>,
    rolleId: { id: string } & Reference<RolleEntity & object>,
    organisationId: { id: string } & Reference<OrganisationEntity & object>,
    params?: Partial<PersonenkontextEntity>,
): PersonenkontextEntity {
    const personenkontext: PersonenkontextEntity = new PersonenkontextEntity();

    const defaultParams: Partial<PersonenkontextEntity> = {
        id: faker.string.uuid(),
        createdAt: faker.date.past(),
        updatedAt: faker.date.recent(),
        personId,
        rolleId,
        organisationId,
        mandant: faker.string.uuid(),
        revision: '1',
        jahrgangsstufe: Jahrgangsstufe.JAHRGANGSSTUFE_1,
        personenstatus: Personenstatus.AKTIV,
        username: 'username',
        sichtfreigabe: SichtfreigabeType.JA,
        loeschungZeitpunkt: faker.date.anytime(),
    };

    Object.assign(personenkontext, defaultParams, params);

    return personenkontext;
}

export async function createAndPersistPersonenkontext(
    em: EntityManager,
    personId: string,
    rolleId: string,
    organisationId: string,
    params?: Partial<PersonenkontextEntity>,
): Promise<PersonenkontextEntity> {
    const defaultParams: RequiredEntityData<PersonenkontextEntity> = {
        id: faker.string.uuid(),
        createdAt: faker.date.past(),
        updatedAt: faker.date.recent(),
        personId,
        rolleId,
        organisationId,
        mandant: faker.string.uuid(),
        revision: '1',
        jahrgangsstufe: Jahrgangsstufe.JAHRGANGSSTUFE_1,
        personenstatus: Personenstatus.AKTIV,
        username: 'username',
        sichtfreigabe: SichtfreigabeType.JA,
        loeschungZeitpunkt: faker.date.anytime(),
    };
    const personenkontext: PersonenkontextEntity = em.create(PersonenkontextEntity, defaultParams);
    Object.assign(personenkontext, params);
    await em.persist(personenkontext).flush();
    return personenkontext;
}
