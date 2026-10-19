import { Test, type TestingModule } from '@nestjs/testing';
import {
    ConfigTestModule,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DoFactory,
    LoggingTestModule,
} from '../../../../../test/utils/index.js';
import { PersonApiModule } from '../../person-api.module.js';
import { PersonRepository } from '../../persistence/person.repository.js';
import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';
import { faker } from '@faker-js/faker';
import { RolleFactory } from '../../../rolle/domain/rolle.factory.js';
import { RolleRepo } from '../../../rolle/repo/rolle.repo.js';
import { type Rolle } from '../../../rolle/domain/rolle.js';
import { Personenkontext } from '../../../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { DBiamPersonenuebersichtController } from './dbiam-personenuebersicht.controller.js';
import { type DBiamFindPersonenuebersichtByPersonIdParams } from './dbiam-find-personenuebersicht-by-personid.params.js';
import { Person } from '../../domain/person.js';
import { OrganisationRepository } from '../../../organisation/persistence/organisation.repository.js';
import { type PersonPermissions } from '../../../authentication/domain/person-permissions.js';
import { type DBiamPersonenuebersichtResponse } from './dbiam-personenuebersicht.response.js';
import { type Organisation } from '../../../organisation/domain/organisation.js';
import { type PersonenuebersichtBodyParams } from './personenuebersicht-body.params.js';
import { EntityNotFoundError } from '../../../../shared/error/entity-not-found.error.js';
import { DbiamPersonenuebersicht } from '../../domain/dbiam-personenuebersicht.js';
import { PersonLandesbediensteterSearchService } from '../../person-landesbedienstete-search/person-landesbediensteter-search.service.js';
import { type PersonID } from '../../../../shared/types/aggregate-ids.types.js';
import { ServiceProviderRepo } from '../../../service-provider/repo/service-provider.repo.js';
import { PermissionTestModule } from '../../../../../test/utils/permission-test.module.js';

function createPersonenkontext<WasPersisted extends boolean>(
    this: void,
    withId: WasPersisted,
    personRepository: PersonRepository,
    organisationRepository: OrganisationRepository,
    rolleRepo: RolleRepo,
    params: Partial<Personenkontext<boolean>> = {},
): Personenkontext<WasPersisted> {
    const personenkontext: Personenkontext<WasPersisted> = Personenkontext.construct<boolean>(
        personRepository,
        organisationRepository,
        rolleRepo,
        withId ? faker.string.uuid() : undefined,
        withId ? faker.date.past() : undefined,
        withId ? faker.date.recent() : undefined,
        faker.string.uuid(),
        faker.string.uuid(),
        faker.string.uuid(),
    );

    Object.assign(personenkontext, params);

    return personenkontext;
}

function createPerson(): Person<true> {
    return Person.construct(
        faker.string.uuid(),
        faker.date.past(),
        faker.date.recent(),
        faker.person.lastName(),
        faker.person.firstName(),
        '1',
        faker.lorem.word(),
        undefined,
        faker.string.uuid(),
    );
}

describe('Personenuebersicht API Mocked', () => {
    let sut: DBiamPersonenuebersichtController;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let organisationRepositoryMock: DeepMocked<OrganisationRepository>;

    let dBiamPersonenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let personPermissionsMock: DeepMocked<PersonPermissions>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                PersonApiModule,
                ConfigTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: false }),
                LoggingTestModule,
                PermissionTestModule,
            ],
            providers: [ServiceProviderRepo, RolleFactory, OrganisationRepository],
        })
            .overrideProvider(DBiamPersonenkontextRepo)
            .useValue(createMock(DBiamPersonenkontextRepo))
            .overrideProvider(RolleRepo)
            .useValue(createMock(RolleRepo))
            .overrideProvider(OrganisationRepository)
            .useValue(createMock(OrganisationRepository))
            .overrideProvider(PersonRepository)
            .useValue(createMock(PersonRepository))
            .overrideProvider(PersonLandesbediensteterSearchService)
            .useValue(createMock(PersonLandesbediensteterSearchService))
            .overrideProvider(ServiceProviderRepo)
            .useValue(createMock(ServiceProviderRepo))
            .compile();

        sut = module.get(DBiamPersonenuebersichtController);
        rolleRepoMock = module.get(RolleRepo);
        organisationRepositoryMock = module.get(OrganisationRepository);
        dBiamPersonenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        personRepositoryMock = module.get(PersonRepository);
        personPermissionsMock = createPersonPermissionsMock();
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(() => {
        vi.restoreAllMocks();
    });

    describe('/GET personenuebersicht', () => {
        describe('when one or more rollen does not exist', () => {
            it('should return Error', async () => {
                const params: DBiamFindPersonenuebersichtByPersonIdParams = {
                    personId: faker.string.uuid(),
                };
                const person: Person<true> = createPerson();
                const rolle: Rolle<true> = DoFactory.createRolle(true);
                const rollenMap: Map<string, Rolle<true>> = new Map();
                rollenMap.set(faker.string.numeric(), rolle); //rolle will not be found with correct id
                const orga: Organisation<true> = DoFactory.createOrganisationAggregate(true);
                const orgaMap: Map<string, Organisation<true>> = new Map();
                orgaMap.set(orga.id, orga);
                const pk: Personenkontext<true> = createPersonenkontext(
                    true,
                    personRepositoryMock,
                    organisationRepositoryMock,
                    rolleRepoMock,
                    {
                        personId: person.id,
                        rolleId: rolle.id,
                        organisationId: orga.id,
                    },
                );

                personRepositoryMock.findById.mockResolvedValueOnce(person);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk]);
                rolleRepoMock.findByIds.mockResolvedValueOnce(rollenMap);
                organisationRepositoryMock.findByIds.mockResolvedValueOnce(orgaMap);
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                    all: false,
                    orgaIds: [orga.id],
                });

                await expect(
                    sut.findPersonenuebersichtenByPerson(params, personPermissionsMock),
                ).rejects.toBeInstanceOf(EntityNotFoundError);
            });
        });

        describe('when permissions are checked and requesting person has PERSONEN_VERWALTEN on same organisation as person', () => {
            it('should return personenkontext with editable true', async () => {
                const params: DBiamFindPersonenuebersichtByPersonIdParams = {
                    personId: faker.string.uuid(),
                };
                const person: Person<true> = createPerson();
                const rolle: Rolle<true> = DoFactory.createRolle(true);
                const rollenMap: Map<string, Rolle<true>> = new Map();
                rollenMap.set(rolle.id, rolle);
                const orga: Organisation<true> = DoFactory.createOrganisationAggregate(true);
                const orgaMap: Map<string, Organisation<true>> = new Map();
                orgaMap.set(orga.id, orga);
                const pk: Personenkontext<true> = createPersonenkontext(
                    true,
                    personRepositoryMock,
                    organisationRepositoryMock,
                    rolleRepoMock,
                    {
                        personId: person.id,
                        rolleId: rolle.id,
                        organisationId: orga.id,
                    },
                );

                personRepositoryMock.findById.mockResolvedValueOnce(person);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk]);
                rolleRepoMock.findByIds.mockResolvedValueOnce(rollenMap);
                organisationRepositoryMock.findByIds.mockResolvedValueOnce(orgaMap);
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                    all: false,
                    orgaIds: [orga.id],
                });

                const result: DBiamPersonenuebersichtResponse = await sut.findPersonenuebersichtenByPerson(
                    params,
                    personPermissionsMock,
                );
                expect(result.zuordnungen).toHaveLength(1);
                expect(result.zuordnungen).toContainEqual(expect.objectContaining({ editable: true }));
            });
        });

        describe('when permissions are checked and requesting person DOES NOT have PERSONEN_VERWALTEN on same organisation as person', () => {
            it('should return personenkontext with editable false', async () => {
                const params: DBiamFindPersonenuebersichtByPersonIdParams = {
                    personId: faker.string.uuid(),
                };
                const person: Person<true> = createPerson();
                const rolle: Rolle<true> = DoFactory.createRolle(true);
                const rollenMap: Map<string, Rolle<true>> = new Map();
                rollenMap.set(rolle.id, rolle);
                const orga: Organisation<true> = DoFactory.createOrganisationAggregate(true);
                const orgaMap: Map<string, Organisation<true>> = new Map();
                orgaMap.set(orga.id, orga);
                const pk: Personenkontext<true> = createPersonenkontext(
                    true,
                    personRepositoryMock,
                    organisationRepositoryMock,
                    rolleRepoMock,
                    {
                        personId: person.id,
                        rolleId: rolle.id,
                        organisationId: orga.id,
                    },
                );

                personRepositoryMock.findById.mockResolvedValueOnce(person);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk]);
                rolleRepoMock.findByIds.mockResolvedValueOnce(rollenMap);
                organisationRepositoryMock.findByIds.mockResolvedValueOnce(orgaMap);
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                    all: false,
                    orgaIds: [faker.string.uuid()],
                });

                const result: DBiamPersonenuebersichtResponse = await sut.findPersonenuebersichtenByPerson(
                    params,
                    personPermissionsMock,
                );
                expect(result.zuordnungen).toHaveLength(1);
                expect(result.zuordnungen).toContainEqual(expect.objectContaining({ editable: false }));
            });
        });
    });

    describe('when an entity is not found when searching all personenkontexte', () => {
        it('should return Error', async () => {
            const bodyParams: PersonenuebersichtBodyParams = { personIds: [faker.string.uuid()] };
            const person: Person<true> = createPerson();
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const rollenMap: Map<string, Rolle<true>> = new Map();
            rollenMap.set(faker.string.numeric(), rolle);
            const orga: Organisation<true> = DoFactory.createOrganisationAggregate(true);
            const orgaMap: Map<string, Organisation<true>> = new Map();
            orgaMap.set(orga.id, orga);
            const pk: Personenkontext<true> = createPersonenkontext(
                true,
                personRepositoryMock,
                organisationRepositoryMock,
                rolleRepoMock,
                {
                    personId: person.id,
                    rolleId: rolle.id,
                    organisationId: orga.id,
                },
            );

            vi.spyOn(DbiamPersonenuebersicht.prototype, 'createZuordnungenForKontexte').mockImplementation(() => {
                return Promise.resolve(new EntityNotFoundError('Some message here'));
            });

            const personkontextMap: Map<PersonID, Personenkontext<true>[]> = new Map<
                PersonID,
                Personenkontext<true>[]
            >();
            personkontextMap.set(person.id, [pk]);
            personRepositoryMock.findByIds.mockResolvedValueOnce([person]);
            dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk]);
            dBiamPersonenkontextRepoMock.findByPersonIds.mockResolvedValueOnce(personkontextMap);
            rolleRepoMock.findByIds.mockResolvedValueOnce(rollenMap);
            organisationRepositoryMock.findByIds.mockResolvedValueOnce(orgaMap);
            personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [orga.id] });

            await expect(sut.findPersonenuebersichten(bodyParams, personPermissionsMock)).rejects.toBeInstanceOf(
                EntityNotFoundError,
            );
        });
    });
});
