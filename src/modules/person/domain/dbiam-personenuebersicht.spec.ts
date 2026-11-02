import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { PersonService } from './person.service.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { PersonRepository } from '../persistence/person.repository.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { DbiamPersonenuebersicht } from './dbiam-personenuebersicht.js';
import { ConfigService } from '@nestjs/config';
import { type Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { type DBiamPersonenzuordnungResponse } from '../api/personenuebersicht/dbiam-personenzuordnung.response.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { ConfigTestModule, DatabaseTestModule, DoFactory } from '../../../../test/utils/index.js';
import { faker } from '@faker-js/faker';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';

describe('DbiamPersonenUebersicht', () => {
    let module: TestingModule;
    let sut: DbiamPersonenuebersicht;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let dbiamPersonenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let organisationRepositoryMock: DeepMocked<OrganisationRepository>;
    let configServiceMock: DeepMocked<ConfigService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule],
            providers: [
                {
                    provide: PersonService,
                    useValue: createMock(PersonService),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
            ],
        }).compile();
        sut = module.get(PersonService);

        personRepositoryMock = module.get(PersonRepository);
        dbiamPersonenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        rolleRepoMock = module.get(RolleRepo);
        organisationRepositoryMock = module.get(OrganisationRepository);
        configServiceMock = module.get(ConfigService);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('createZuordnungenForKontexte', () => {
        let fakeRolleId: string;
        let fakeOrganisationId: string;
        let rolle: Rolle<true>;
        let organisation: Organisation<true>;
        let latestPKUpdatedAt: Date;
        let personenkontextPast: Personenkontext<true>;
        let personenkontextRecent: Personenkontext<true>;
        let personenkontexte: Personenkontext<true>[];
        let rolleMap: Map<string, Rolle<true>>;
        let orgaMap: Map<string, Organisation<true>>;

        beforeEach(() => {
            fakeRolleId = faker.string.uuid();
            fakeOrganisationId = faker.string.uuid();
            rolle = DoFactory.createRolle<true>(true, { id: fakeRolleId, rollenart: RollenArt.LEIT });
            organisation = DoFactory.createOrganisation<true>(true, { id: fakeOrganisationId });
            latestPKUpdatedAt = faker.date.recent();
            personenkontextPast = DoFactory.createPersonenkontext<true>(true, {
                rolleId: rolle.id,
                organisationId: organisation.id,
                updatedAt: faker.date.past(),
            });
            personenkontextRecent = DoFactory.createPersonenkontext<true>(true, {
                rolleId: rolle.id,
                organisationId: organisation.id,
                updatedAt: latestPKUpdatedAt,
            });
            personenkontexte = [personenkontextPast, personenkontextRecent];
            rolleMap = new Map();
            rolleMap.set(rolle.id, rolle);
            orgaMap = new Map();
            orgaMap.set(organisation.id, organisation);

            sut = DbiamPersonenuebersicht.createNew(
                personRepositoryMock,
                dbiamPersonenkontextRepoMock,
                organisationRepositoryMock,
                rolleRepoMock,
                configServiceMock,
            );
        });

        describe('when organisation entity is not found in OrgaMap', () => {
            it('should return EntityNotFoundError', async () => {
                orgaMap = new Map();
                personenkontexte = [personenkontextPast, personenkontextRecent];

                const res: [DBiamPersonenzuordnungResponse[], Date?] | EntityNotFoundError =
                    await sut.createZuordnungenForKontexte(personenkontexte, rolleMap, orgaMap, undefined);

                expect(res).toBeDefined();
                expect(res).toBeInstanceOf(EntityNotFoundError);
            });
        });

        describe('when rolle entity is not found in RolleMap', () => {
            it('should return EntityNotFoundError', async () => {
                rolleMap = new Map();
                personenkontexte = [personenkontextPast, personenkontextRecent];

                const res: [DBiamPersonenzuordnungResponse[], Date?] | EntityNotFoundError =
                    await sut.createZuordnungenForKontexte(personenkontexte, rolleMap, orgaMap, undefined);

                expect(res).toBeDefined();
                expect(res).toBeInstanceOf(EntityNotFoundError);
            });
        });

        describe('when most recent PK is last or later in list', () => {
            it('should set lastModifiedZuordnungen to value of latest PK updatedAt timestamp', async () => {
                personenkontexte = [personenkontextPast, personenkontextRecent];

                const res: [DBiamPersonenzuordnungResponse[], Date?] | EntityNotFoundError =
                    await sut.createZuordnungenForKontexte(personenkontexte, rolleMap, orgaMap, undefined);

                if (res instanceof EntityNotFoundError) {
                    throw res;
                }
                const [responses, lastModified]: [DBiamPersonenzuordnungResponse[], Date?] = res;

                expect(responses).toBeDefined();
                expect(lastModified).toBeDefined();
                expect(lastModified).toStrictEqual(latestPKUpdatedAt);
            });
        });

        describe('when most recentPK is first in list', () => {
            it('should set lastModifiedZuordnungen to value of latest PK updatedAt timestamp', async () => {
                personenkontexte = [personenkontextRecent, personenkontextPast];

                const res: [DBiamPersonenzuordnungResponse[], Date?] | EntityNotFoundError =
                    await sut.createZuordnungenForKontexte(personenkontexte, rolleMap, orgaMap, undefined);
                if (res instanceof EntityNotFoundError) {
                    throw res;
                }
                const [responses, lastModified]: [DBiamPersonenzuordnungResponse[], Date?] = res;

                expect(responses).toBeDefined();
                expect(lastModified).toBeDefined();
                expect(lastModified).toStrictEqual(latestPKUpdatedAt);
            });
        });

        describe('loading of orga-admins', () => {
            it('should add the admins to the response when not LEIT', async () => {
                rolle = DoFactory.createRolle<true>(true, { id: fakeRolleId, rollenart: RollenArt.LEHR });
                rolleMap.set(rolle.id, rolle);
                personenkontexte = [personenkontextRecent];
                personRepositoryMock.findOrganisationAdminsByOrganisationId.mockResolvedValueOnce(['adminA']);

                const res: [DBiamPersonenzuordnungResponse[], Date?] | EntityNotFoundError =
                    await sut.createZuordnungenForKontexte(personenkontexte, rolleMap, orgaMap, undefined);
                if (res instanceof EntityNotFoundError) {
                    throw res;
                }

                expect(res[0]).toBeDefined();
                expect(res[0]).toHaveLength(1);
                expect(res[0][0]!.admins).toEqual(['adminA']);
            });

            it('should not add the admins to the response when LEIT', async () => {
                rolle = DoFactory.createRolle<true>(true, { id: fakeRolleId, rollenart: RollenArt.LEIT });
                rolleMap.set(rolle.id, rolle);
                personenkontexte = [personenkontextRecent];
                personRepositoryMock.findOrganisationAdminsByOrganisationId.mockResolvedValueOnce(['adminA']);

                const res: [DBiamPersonenzuordnungResponse[], Date?] | EntityNotFoundError =
                    await sut.createZuordnungenForKontexte(personenkontexte, rolleMap, orgaMap, undefined);
                if (res instanceof EntityNotFoundError) {
                    throw res;
                }

                expect(res[0]).toBeDefined();
                expect(res[0]).toHaveLength(1);
                expect(res[0][0]!.admins).toBeUndefined();
            });
        });
    });
});
