import { type EntityManager, type RequiredEntityData } from '@mikro-orm/postgresql';
import { PersonenkontextEntity } from '../../src/modules/personenkontext/persistence/personenkontext.entity.js';
import { faker } from '@faker-js/faker';
import {
    Jahrgangsstufe,
    Personenstatus,
    SichtfreigabeType,
} from '../../src/modules/personenkontext/domain/personenkontext.enums.js';
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
