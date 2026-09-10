import { faker } from '@faker-js/faker';
import { Collection, EntityManager, EntityName, MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Mock, vi } from 'vitest';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import {
    ConfigTestModule,
    DatabaseTestModule,
    DoFactory,
    expectErrResult,
    expectOkResult,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import {
    createAndPersistOrganisation,
    createAndPersistRootOrganisation,
} from '../../../../test/utils/organisation-test-helper.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID, PersonenkontextID, PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { generatePassword } from '../../../shared/util/password-generator.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { EmailMicroserviceModule } from '../../email-microservice/email-microservice.module.js';
import { EmailPersistenceModule } from '../../email/email-persistence.module.js';
import { KeycloakUserService } from '../../keycloak-administration/index.js';
import { UserLockRepository } from '../../keycloak-administration/repository/user-lock.repository.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationModule } from '../../organisation/organisation.module.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { PersonFactory } from '../../person/domain/person.factory.js';
import { Person } from '../../person/domain/person.js';
import { UsernameGeneratorService } from '../../person/domain/username-generator.service.js';
import { EntityAggregateMapper } from '../../person/mapper/entity-aggregate.mapper.js';
import { OxUserBlacklistRepo } from '../../person/persistence/ox-user-blacklist.repo.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { RolleFactory } from '../../rolle/domain/rolle.factory.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RollenerweiterungFactory } from '../../rolle/domain/rollenerweiterung.factory.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RolleServiceProviderEntity } from '../../rolle/entity/rolle-service-provider.entity.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderMerkmalEntity } from '../../service-provider/repo/service-provider-merkmal.entity.js';
import { ServiceProviderRollenartWhitelistEntity } from '../../service-provider/repo/service-provider-rollenart-whitelist.entity.js';
import { ServiceProviderEntity } from '../../service-provider/repo/service-provider.entity.js';
import { ServiceProviderModule } from '../../service-provider/service-provider.module.js';
import { PersonenkontextFactory } from '../domain/personenkontext.factory.js';
import { mapAggregateToPartial, Personenkontext } from '../domain/personenkontext.js';
import {
    DBiamPersonenkontextRepo,
    ErweiterterServiceProviderForPK,
    ExternalPkData,
    KontextWithOrgaAndRolle,
    RollenCount,
} from './dbiam-personenkontext.repo.js';
import { DBiamPersonenkontextRepoInternal } from './internal-dbiam-personenkontext.repo.js';
import { PersonenkontextEntity } from './personenkontext.entity.js';
import { PersonenkontextScope } from './personenkontext.scope.js';

describe('dbiam Personenkontext Repo', () => {
    let module: TestingModule;
    let sut: DBiamPersonenkontextRepo;
    let orm: MikroORM;
    let em: EntityManager;

    let personenkontextRepoInternal: DBiamPersonenkontextRepoInternal;
    let personFactory: PersonFactory;
    let personRepo: PersonRepository;
    let organisationRepository: OrganisationRepository;
    let rolleRepo: RolleRepo;
    let rollenerweiterungRepo: RollenerweiterungRepo;
    let keycloakUserService: DeepMocked<KeycloakUserService>;

    let personenkontextFactory: PersonenkontextFactory;

    function createPersonenkontext<WasPersisted extends boolean>(
        this: void,
        withId: WasPersisted,
        params: Partial<Personenkontext<boolean>> = {},
    ): Personenkontext<WasPersisted> {
        const personenkontext: Personenkontext<WasPersisted> = personenkontextFactory.construct<boolean>(
            withId ? faker.string.uuid() : undefined,
            withId ? faker.date.past() : undefined,
            withId ? faker.date.recent() : undefined,
            undefined,
            faker.string.uuid(),
            faker.string.uuid(),
            faker.string.uuid(),
        );

        Object.assign(personenkontext, params);

        return personenkontext;
    }

    beforeAll(async () => {
        keycloakUserService = createMock<KeycloakUserService>(KeycloakUserService);
        keycloakUserService.create.mockImplementation(() => {
            return Promise.resolve({
                ok: true,
                value: faker.string.uuid(),
            });
        });
        keycloakUserService.setPassword.mockResolvedValue({
            ok: true,
            value: faker.string.alphanumeric(16),
        });

        module = await Test.createTestingModule({
            imports: [
                ConfigTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                // RolleModule,
                OrganisationModule,
                LoggingTestModule,
                ServiceProviderModule,
                EmailPersistenceModule,
                EmailMicroserviceModule,
            ],
            providers: [
                DBiamPersonenkontextRepo,
                DBiamPersonenkontextRepoInternal,
                PersonFactory,
                PersonRepository,
                UsernameGeneratorService,
                OxUserBlacklistRepo,
                RolleFactory,
                RolleRepo,
                RollenerweiterungRepo,
                RollenerweiterungFactory,
                PersonenkontextFactory,
                EntityAggregateMapper,
                {
                    provide: KeycloakUserService,
                    useValue: keycloakUserService,
                },
                {
                    provide: UserLockRepository,
                    useValue: createMock(UserLockRepository),
                },
            ],
        })
            .overrideProvider(KeycloakUserService)
            .useValue(keycloakUserService)
            .compile();

        sut = module.get(DBiamPersonenkontextRepo);
        personenkontextRepoInternal = module.get(DBiamPersonenkontextRepoInternal);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);
        personFactory = module.get(PersonFactory);
        personRepo = module.get(PersonRepository);
        organisationRepository = module.get(OrganisationRepository);
        rolleRepo = module.get(RolleRepo);
        rollenerweiterungRepo = module.get(RollenerweiterungRepo);
        personenkontextFactory = module.get(PersonenkontextFactory);
        await DatabaseTestModule.setupDatabase(orm);
    }, 10000000);

    async function createPerson(): Promise<Person<true>> {
        const personResult: Person<false> | DomainError = await personFactory.createNew({
            vorname: faker.person.firstName(),
            familienname: faker.person.lastName(),
            username: faker.internet.username(),
            password: generatePassword(),
        });
        if (personResult instanceof DomainError) {
            throw personResult;
        }
        const person: Person<true> | DomainError = await personRepo.create(personResult);
        if (person instanceof DomainError) {
            throw person;
        }

        return person;
    }

    async function createRolle(props: Partial<Rolle<false>> = {}): Promise<Rolle<true>> {
        const rolle: Rolle<false> = DoFactory.createRolle(false, props);

        const result: Rolle<true> | DomainError = await rolleRepo.save(rolle);

        expect(result).not.toBeInstanceOf(DomainError);

        return result as Rolle<true>;
    }

    function createPermissions(person: Person<true>): IPersonPermissions {
        return new PersonPermissions(sut, organisationRepository, rolleRepo, person);
    }

    afterAll(async () => {
        await module.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
        expect(em).toBeDefined();
    });

    describe('findByID', () => {
        it('should return personenkontext by ID', async () => {
            const person: Person<true> = await createPerson();
            const rolle: Rolle<true> = await createRolle();
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );

            const personenkontext: Personenkontext<true> = await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    personId: person.id,
                    rolleId: rolle.id,
                    organisationId: organisation.id,
                }),
            );

            const result: Option<Personenkontext<true>> = await sut.findByID(personenkontext.id);

            expect(result).toBeInstanceOf(Personenkontext);
            expect(result?.id).toBe(personenkontext.id);
        });

        it('should return null if not found', async () => {
            const result: Option<Personenkontext<true>> = await sut.findByID(faker.string.uuid());

            expect(result).toBeNull();
        });
    });

    describe('findExternalPkData', () => {
        it('should find relevant external personenkontext data for this person', async () => {
            const person: Person<true> = await createPerson();
            const rolleA: Rolle<true> = await createRolle();
            const rolleB: Rolle<true> = await createRolle();
            const organisationA: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );
            const organisationB: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    personId: person.id,
                    rolleId: rolleA.id,
                    organisationId: organisationA.id,
                }),
            );
            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    personId: person.id,
                    rolleId: rolleB.id,
                    organisationId: organisationA.id,
                }),
            );
            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    personId: person.id,
                    rolleId: rolleB.id,
                    organisationId: organisationB.id,
                }),
            );

            const result: ExternalPkData[] = await sut.findExternalPkData(person.id);
            expect(result.length).toEqual(3);
            expect(
                result.findIndex(
                    (expk: ExternalPkData) =>
                        expk.rollenart === rolleA.rollenart && expk.kennung === organisationA.kennung,
                ),
            ).not.toEqual(-1);
            expect(
                result.findIndex(
                    (expk: ExternalPkData) =>
                        expk.rollenart === rolleB.rollenart && expk.kennung === organisationA.kennung,
                ),
            ).not.toEqual(-1);
            expect(
                result.findIndex(
                    (expk: ExternalPkData) =>
                        expk.rollenart === rolleB.rollenart && expk.kennung === organisationB.kennung,
                ),
            ).not.toEqual(-1);
        });

        // This extra test is for the line coverage of the mapping from RolleServiceProviderEntity to ServiceProviderEntity
        it('should find relevant external personenkontext data including original and extra serviceProvider', async () => {
            const person: Person<true> = await createPerson();
            const organisationA: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );
            const rolleA: Rolle<true> = await createRolle();

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    personId: person.id,
                    rolleId: rolleA.id,
                    organisationId: organisationA.id,
                }),
            );

            const mockMerkmale: DeepMocked<Collection<ServiceProviderMerkmalEntity>> =
                createMock<Collection<ServiceProviderMerkmalEntity>>(Collection);
            mockMerkmale.getItems.mockReturnValue([]);
            mockMerkmale.map.mockImplementation(
                (callback: (item: ServiceProviderMerkmalEntity, index: number) => unknown) =>
                    mockMerkmale.getItems().map(callback),
            );

            // Mock the ORM response for rolle.serviceProvider.getItems()
            const mockServiceProvider: DeepMocked<ServiceProviderEntity> =
                createMock<ServiceProviderEntity>(ServiceProviderEntity);
            mockServiceProvider.name = 'Mocked Service Provider';
            mockServiceProvider.vidisAngebotId = faker.string.uuid();
            mockServiceProvider.merkmale = mockMerkmale;
            mockServiceProvider.rollenartenWhitelist = createMock<Collection<ServiceProviderRollenartWhitelistEntity>>(
                Collection<ServiceProviderRollenartWhitelistEntity>,
            );
            const mockRolleServiceProviderEntity: RolleServiceProviderEntity =
                createMock<RolleServiceProviderEntity>(RolleServiceProviderEntity);
            mockRolleServiceProviderEntity.serviceProvider = mockServiceProvider;

            const findSpy: Mock = vi.spyOn(sut['em'], 'find').mockImplementation(<T>(entityClass: EntityName<T>) => {
                if (entityClass === PersonenkontextEntity) {
                    return Promise.resolve([
                        {
                            id: 'pk-123',
                            rolleId: {
                                unwrap: () => ({
                                    rollenart: rolleA.rollenart,
                                    serviceProvider: {
                                        getItems: () => [mockRolleServiceProviderEntity],
                                    },
                                }),
                            },
                            organisationId: {
                                unwrap: () => ({ kennung: organisationA.kennung }),
                            },
                        },
                    ]);
                }

                return Promise.resolve([]);
            });

            const result: ExternalPkData[] = await sut.findExternalPkData(person.id);

            expect(result.length).toEqual(1);
            const pkData: ExternalPkData | undefined = result[0];
            expect(pkData?.rollenart).toEqual(rolleA.rollenart);
            expect(pkData?.kennung).toEqual(organisationA.kennung);

            const spIds: string[] | undefined = pkData?.serviceProvider?.map((sp: ServiceProvider<true>) => sp.id);
            expect(spIds).toContain(mockServiceProvider.id); // from mocked RolleServiceProviderEntity

            findSpy.mockRestore();
        });
    });

    describe('findBy', () => {
        describe('When personenkontext for person exists', () => {
            it('should find all personenkontexte for this person', async () => {
                const person: Person<true> = await createPerson();
                const rolleA: Rolle<true> = await createRolle();
                const rolleB: Rolle<true> = await createRolle();
                const organisation: Organisation<true> = await organisationRepository.save(
                    DoFactory.createOrganisation(false),
                );

                const personenkontextA: Personenkontext<true> = await personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: person.id,
                        rolleId: rolleA.id,
                        organisationId: organisation.id,
                    }),
                );
                const personenkontextB: Personenkontext<true> = await personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: person.id,
                        rolleId: rolleB.id,
                        organisationId: organisation.id,
                    }),
                );

                const scope: PersonenkontextScope = new PersonenkontextScope().findBy({
                    personId: person.id,
                });

                const [result, count]: Counted<Personenkontext<true>> = await sut.findBy(scope);

                expect(result).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining(mapAggregateToPartial(personenkontextA)),
                        expect.objectContaining(mapAggregateToPartial(personenkontextB)),
                    ]),
                );
                expect(count).toBe(2);
            });
        });

        describe('When no personenkontext matches', () => {
            it('should return an empty list', async () => {
                const [result]: Counted<Personenkontext<true>> = await sut.findBy(new PersonenkontextScope());

                expect(result).not.toBeNull();
                expect(result).toHaveLength(0);
            });
        });
    });

    describe('findByPersonAuthorized', () => {
        describe('when admin has permissions', () => {
            it('should return all personenkontexte for a person', async () => {
                const admin: Person<true> = await createPerson();
                const rootOrga: OrganisationID = (await createAndPersistRootOrganisation(em, organisationRepository))
                    .id;
                const adminRolle: Rolle<true> = await createRolle({
                    administeredBySchulstrukturknoten: rootOrga,
                    rollenart: RollenArt.SYSADMIN,
                    systemrechte: [RollenSystemRecht.PERSONEN_VERWALTEN],
                });
                await personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: admin.id,
                        organisationId: rootOrga,
                        rolleId: adminRolle.id,
                    }),
                );

                const permissions: IPersonPermissions = createPermissions(admin);

                const personA: Person<true> = await createPerson();
                const personB: Person<true> = await createPerson();
                const rolle: Rolle<true> = await createRolle();
                const organisation: Organisation<true> = await organisationRepository.save(
                    DoFactory.createOrganisation(false, {
                        administriertVon: rootOrga,
                    }),
                );

                await Promise.all([
                    personenkontextRepoInternal.save(
                        createPersonenkontext(false, {
                            personId: personA.id,
                            rolleId: rolle.id,
                            organisationId: organisation.id,
                        }),
                    ),
                    personenkontextRepoInternal.save(
                        createPersonenkontext(false, {
                            personId: personB.id,
                            rolleId: rolle.id,
                            organisationId: organisation.id,
                        }),
                    ),
                ]);

                const result: Result<Personenkontext<true>[], MissingPermissionsError> =
                    await sut.findByPersonAuthorized(personA.id, permissions);

                expectOkResult(result);
                expect(result.value).toHaveLength(1);
            });
        });

        describe('when admin does not have permissions', () => {
            it('should return error', async () => {
                const admin: Person<true> = await createPerson();
                const rootOrga: OrganisationID = (await createAndPersistRootOrganisation(em, organisationRepository))
                    .id;
                const adminRolle: Rolle<true> = await createRolle({
                    administeredBySchulstrukturknoten: rootOrga,
                    rollenart: RollenArt.SYSADMIN,
                    systemrechte: [],
                });
                await personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: admin.id,
                        organisationId: rootOrga,
                        rolleId: adminRolle.id,
                    }),
                );

                const permissions: IPersonPermissions = createPermissions(admin);

                const personA: Person<true> = await createPerson();
                const personB: Person<true> = await createPerson();
                const rolle: Rolle<true> = await createRolle();
                const organisation: Organisation<true> = await organisationRepository.save(
                    DoFactory.createOrganisation(false, {
                        administriertVon: rootOrga,
                    }),
                );

                await Promise.all([
                    personenkontextRepoInternal.save(
                        createPersonenkontext(false, {
                            personId: personA.id,
                            rolleId: rolle.id,
                            organisationId: organisation.id,
                        }),
                    ),
                    personenkontextRepoInternal.save(
                        createPersonenkontext(false, {
                            personId: personB.id,
                            rolleId: rolle.id,
                            organisationId: organisation.id,
                        }),
                    ),
                ]);

                const result: Result<Personenkontext<true>[], MissingPermissionsError> =
                    await sut.findByPersonAuthorized(personA.id, permissions);
                expectErrResult(result);
                expect(result.error).toBeInstanceOf(MissingPermissionsError);
            });
        });
    });
    describe('findByPerson', () => {
        it('should return all personenkontexte for a person', async () => {
            const personA: Person<true> = await createPerson();
            const personB: Person<true> = await createPerson();
            const rolle: Rolle<true> = await createRolle();
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );

            await Promise.all([
                personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: personA.id,
                        rolleId: rolle.id,
                        organisationId: organisation.id,
                    }),
                ),
                personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: personB.id,
                        rolleId: rolle.id,
                        organisationId: organisation.id,
                    }),
                ),
            ]);

            const personenkontexte: Personenkontext<true>[] = await sut.findByPerson(personA.id);

            expect(personenkontexte).toHaveLength(1);
        });
    });

    describe('findByPersonWithOrgaAndRolle', () => {
        it('should return all personenkontexte for a person with orga and rolle', async () => {
            const personA: Person<true> = await createPerson();
            const personB: Person<true> = await createPerson();
            const rolle: Rolle<true> = await createRolle();
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );

            await Promise.all([
                personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: personA.id,
                        rolleId: rolle.id,
                        organisationId: organisation.id,
                    }),
                ),
                personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: personB.id,
                        rolleId: rolle.id,
                        organisationId: organisation.id,
                    }),
                ),
            ]);

            const personenkontexte: Array<KontextWithOrgaAndRolle> = await sut.findByPersonWithOrgaAndRolle(personA.id);

            expect(personenkontexte).toHaveLength(1);
            expect(personenkontexte.at(0)?.organisation.id).toEqual(organisation.id);
            expect(personenkontexte.at(0)?.rolle.id).toEqual(rolle.id);
        });
    });

    describe('findByPersonIdsAndServiceprovidersWithOrgaAndRolle', () => {
        it('should return all personenkontexte for a person with orga and rolle', async () => {
            const personA: Person<true> = await createPerson();
            const personB: Person<true> = await createPerson();
            const serviceprovider: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const rolle: Rolle<true> = await createRolle({ serviceProviderIds: [serviceprovider.id] });
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );

            await Promise.all([
                personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: personA.id,
                        rolleId: rolle.id,
                        organisationId: organisation.id,
                    }),
                ),
                personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: personB.id,
                        rolleId: rolle.id,
                        organisationId: organisation.id,
                    }),
                ),
            ]);

            const personenkontexte: Map<PersonID, KontextWithOrgaAndRolle[]> =
                await sut.findByPersonIdsAndServiceprovidersWithOrgaAndRolle(
                    [personA.id, personB.id],
                    [serviceprovider.id],
                    { all: true },
                );

            expect(personenkontexte.size).toEqual(2);
            expect(personenkontexte.get(personA.id)).toHaveLength(1);
            expect(personenkontexte.get(personB.id)).toHaveLength(1);
        });

        it('should only return kontexte at permitted orgas', async () => {
            const person: Person<true> = await createPerson();
            const serviceprovider: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const rolle: Rolle<true> = await createRolle({ serviceProviderIds: [serviceprovider.id] });
            const organisationA: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );
            const organisationB: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );

            await Promise.all([
                personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: person.id,
                        rolleId: rolle.id,
                        organisationId: organisationA.id,
                    }),
                ),
                personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: person.id,
                        rolleId: rolle.id,
                        organisationId: organisationB.id,
                    }),
                ),
            ]);

            const personenkontexte: Map<PersonID, KontextWithOrgaAndRolle[]> =
                await sut.findByPersonIdsAndServiceprovidersWithOrgaAndRolle([person.id], [serviceprovider.id], {
                    all: false,
                    orgaIds: [organisationA.id],
                });

            expect(personenkontexte.size).toEqual(1);
            expect(personenkontexte.get(person.id)).toHaveLength(1);
        });

        it('should return all personenkontexte when a rollenerweiterung exists', async () => {
            const person: Person<true> = await createPerson();
            const serviceprovider: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const rolle: Rolle<true> = await createRolle();
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );
            await rollenerweiterungRepo.create(
                DoFactory.createRollenerweiterung(false, {
                    rolleId: rolle.id,
                    organisationId: organisation.id,
                    serviceProviderId: serviceprovider.id,
                }),
            );

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    personId: person.id,
                    rolleId: rolle.id,
                    organisationId: organisation.id,
                }),
            );

            const personenkontexte: Map<PersonID, KontextWithOrgaAndRolle[]> =
                await sut.findByPersonIdsAndServiceprovidersWithOrgaAndRolle([person.id], [serviceprovider.id], {
                    all: true,
                });

            expect(personenkontexte.size).toEqual(1);
            expect(personenkontexte.get(person.id)).toHaveLength(1);
        });

        // see bug spsh-2982
        it('should not personenkontexte when another rollenerweiterung exists', async () => {
            const person: Person<true> = await createPerson();
            const serviceproviderA: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const serviceproviderB: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const rolleWithProviderA: Rolle<true> = await createRolle();
            const rolleWithProviderB: Rolle<true> = await createRolle();
            const organisationA: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );
            const organisationB: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );
            await rollenerweiterungRepo.create(
                DoFactory.createRollenerweiterung(false, {
                    rolleId: rolleWithProviderA.id,
                    organisationId: organisationA.id,
                    serviceProviderId: serviceproviderA.id,
                }),
            );
            await rollenerweiterungRepo.create(
                DoFactory.createRollenerweiterung(false, {
                    rolleId: rolleWithProviderB.id,
                    organisationId: organisationB.id,
                    serviceProviderId: serviceproviderB.id,
                }),
            );

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    personId: person.id,
                    rolleId: rolleWithProviderA.id,
                    organisationId: organisationA.id,
                }),
            );
            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    personId: person.id,
                    rolleId: rolleWithProviderB.id,
                    organisationId: organisationB.id,
                }),
            );

            const personenkontexte: Map<PersonID, KontextWithOrgaAndRolle[]> =
                await sut.findByPersonIdsAndServiceprovidersWithOrgaAndRolle([person.id], [serviceproviderA.id], {
                    all: true,
                });

            expect(personenkontexte.size).toEqual(1);
            expect(personenkontexte.get(person.id)).toHaveLength(1);
        });

        it('should return not return personenkontexte when it doesnt have the serviceprovider', async () => {
            const person: Person<true> = await createPerson();
            const serviceproviderA: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const serviceproviderB: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const rolleA: Rolle<true> = await createRolle({
                serviceProviderIds: [serviceproviderA.id, serviceproviderB.id],
            });
            const rolleB: Rolle<true> = await createRolle({ serviceProviderIds: [serviceproviderB.id] });
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );

            await Promise.all([
                personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: person.id,
                        rolleId: rolleA.id,
                        organisationId: organisation.id,
                    }),
                ),
                personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: person.id,
                        rolleId: rolleB.id,
                        organisationId: organisation.id,
                    }),
                ),
            ]);

            const personenkontexte: Map<PersonID, KontextWithOrgaAndRolle[]> =
                await sut.findByPersonIdsAndServiceprovidersWithOrgaAndRolle([person.id], [serviceproviderA.id], {
                    all: true,
                });

            expect(personenkontexte.size).toEqual(1);
            expect(personenkontexte.get(person.id)).toHaveLength(1);
        });
    });

    describe('findByRolle', () => {
        it('should return all personenkontexte for a rolle', async () => {
            const person: Person<true> = await createPerson();
            const rolle: Rolle<true> = await createRolle();
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    rolleId: rolle.id,
                    personId: person.id,
                    organisationId: organisation.id,
                }),
            );
            const personenkontexte: Personenkontext<true>[] = await sut.findByRolle(rolle.id);

            expect(personenkontexte).toHaveLength(1);
        });
    });

    describe('findWithRolleAtItslearningOrgaByCursor', () => {
        it('should return all personenkontexte for a rolle', async () => {
            const person: Person<true> = await createPerson();
            const sp: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                externalSystem: ServiceProviderSystem.ITSLEARNING,
            });
            const rolle: Rolle<true> = await createRolle({ serviceProviderIds: [sp.id] });
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, { itslearningEnabled: true }),
            );

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    rolleId: rolle.id,
                    personId: person.id,
                    organisationId: organisation.id,
                }),
            );

            let pks: Personenkontext<true>[];
            let cursor: string | undefined;

            [pks, cursor] = await sut.findWithRolleAtItslearningOrgaByCursor(rolle.id, 1, cursor);

            expect(pks).toHaveLength(1);
            expect(cursor).toBeDefined();

            [pks, cursor] = await sut.findWithRolleAtItslearningOrgaByCursor(rolle.id, 1, cursor);

            expect(pks).toHaveLength(0);
            expect(cursor).toBeUndefined();
        });

        it('should not return personenkontexte, when another with itslearning exists for the same person at the same orga', async () => {
            const person: Person<true> = await createPerson();
            const sp: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                externalSystem: ServiceProviderSystem.ITSLEARNING,
            });
            const rolleA: Rolle<true> = await createRolle({ serviceProviderIds: [sp.id] });
            const rolleB: Rolle<true> = await createRolle({ serviceProviderIds: [sp.id] });
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, { itslearningEnabled: true }),
            );

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    rolleId: rolleA.id,
                    personId: person.id,
                    organisationId: organisation.id,
                }),
            );
            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    rolleId: rolleB.id,
                    personId: person.id,
                    organisationId: organisation.id,
                }),
            );

            const [pks, cursor]: [Personenkontext<true>[], string | undefined] =
                await sut.findWithRolleAtItslearningOrgaByCursor(rolleA.id, 1);

            expect(pks).toHaveLength(0);
            expect(cursor).toBeUndefined();
        });
    });

    describe('find', () => {
        describe('when personenkontext exists', () => {
            it('should return a personenkontext by personId, organisationId, rolleId', async () => {
                const person: Person<true> = await createPerson();
                const organisation: Organisation<true> = await organisationRepository.save(
                    DoFactory.createOrganisation(false),
                );
                const rolle: Rolle<true> = await createRolle();

                await personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        rolleId: rolle.id,
                        organisationId: organisation.id,
                        personId: person.id,
                    }),
                );
                const personenkontext: Option<Personenkontext<true>> = await sut.find(
                    person.id,
                    organisation.id,
                    rolle.id,
                );

                expect(personenkontext).toBeTruthy();
            });
        });

        describe('when personenkontext does NOT exist', () => {
            it('should return null', async () => {
                const personUUID: string = faker.string.uuid();
                const organisationUUID: string = faker.string.uuid();
                const rolle: Rolle<true> = await createRolle();

                const personenkontext: Option<Personenkontext<true>> = await sut.find(
                    personUUID,
                    organisationUUID,
                    rolle.id,
                );

                expect(personenkontext).toBeNull();
            });
        });
    });

    describe('findByIDAuthorized', () => {
        it('should succeed if the user is authorized', async () => {
            const person: Person<true> = await createPerson();
            const rootOrga: OrganisationID = (await createAndPersistRootOrganisation(em, organisationRepository)).id;
            const rolle: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrga,
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [RollenSystemRecht.PERSONEN_VERWALTEN],
            });
            const personenkontext: Personenkontext<true> = await personenkontextRepoInternal.save(
                createPersonenkontext(false, { personId: person.id, organisationId: rootOrga, rolleId: rolle.id }),
            );
            const permissions: IPersonPermissions = createPermissions(person);

            const result: Result<Personenkontext<true>, DomainError> = await sut.findByIDAuthorized(
                personenkontext.id,
                permissions,
            );

            expect(result).toEqual({
                ok: true,
                value: expect.objectContaining(mapAggregateToPartial(personenkontext)) as Personenkontext<true>,
            });
        });

        it('should return EntityNotFoundError if not found', async () => {
            const person: Person<true> = await createPerson();
            const rootOrga: OrganisationID = (await createAndPersistRootOrganisation(em, organisationRepository)).id;
            const sysadmin: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrga,
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [RollenSystemRecht.PERSONEN_VERWALTEN],
            });
            await personenkontextRepoInternal.save(
                createPersonenkontext(false, { personId: person.id, organisationId: rootOrga, rolleId: sysadmin.id }),
            );
            const permissions: IPersonPermissions = createPermissions(person);

            const id: PersonenkontextID = faker.string.uuid();

            const result: Result<Personenkontext<true>, DomainError> = await sut.findByIDAuthorized(id, permissions);

            expect(result).toEqual({
                ok: false,
                error: new EntityNotFoundError('Personenkontext', id),
            });
        });

        it('should return MissingPermissionsError if not authorized', async () => {
            const person: Person<true> = await createPerson();
            const schule: OrganisationID = (await createAndPersistOrganisation(em, undefined, OrganisationsTyp.SCHULE))
                .id;
            const lehrer: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: schule,
                rollenart: RollenArt.LEHR,
                systemrechte: [],
            });
            const personenkontext: Personenkontext<true> = await personenkontextRepoInternal.save(
                createPersonenkontext(false, { personId: person.id, organisationId: schule, rolleId: lehrer.id }),
            );
            const permissions: IPersonPermissions = createPermissions(person);

            const result: Result<Personenkontext<true>, DomainError> = await sut.findByIDAuthorized(
                personenkontext.id,
                permissions,
            );

            expect(result).toEqual({
                ok: false,
                error: new MissingPermissionsError('Access denied'),
            });
        });
    });

    describe('hasPersonAnyReadableKontext', () => {
        it('should return false if the person has no kontext', async () => {
            const caller: Person<true> = await createPerson();
            const target: Person<true> = await createPerson();

            const permissions: IPersonPermissions = createPermissions(caller);

            const result: Result<boolean, DomainError> = await sut.hasPersonAnyReadableKontext(target.id, permissions);

            expect(result).toEqual({
                ok: true,
                value: false,
            });
        });

        it('should return true if the caller can read at least one kontext', async () => {
            const caller: Person<true> = await createPerson();
            const target: Person<true> = await createPerson();

            const rootOrgaA: OrganisationID = (await createAndPersistRootOrganisation(em, organisationRepository)).id;
            const rootOrgaB: OrganisationID = (await createAndPersistRootOrganisation(em, organisationRepository)).id;

            const callerRole: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrgaA,
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
            });
            const targetRoleA: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrgaA,
                rollenart: RollenArt.LEHR,
                systemrechte: [],
            });
            const targetRoleB: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrgaB,
                rollenart: RollenArt.LEHR,
                systemrechte: [],
            });

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    personId: caller.id,
                    organisationId: rootOrgaA,
                    rolleId: callerRole.id,
                }),
            );
            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    personId: target.id,
                    organisationId: rootOrgaA,
                    rolleId: targetRoleA.id,
                }),
            );
            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    personId: target.id,
                    organisationId: rootOrgaB,
                    rolleId: targetRoleB.id,
                }),
            );

            const permissions: IPersonPermissions = createPermissions(caller);

            const result: Result<boolean, DomainError> = await sut.hasPersonAnyReadableKontext(target.id, permissions);

            expect(result).toEqual({
                ok: true,
                value: true,
            });
        });

        it('should check repeated kontexte at the same organisation only once', async () => {
            const caller: Person<true> = await createPerson();
            const target: Person<true> = await createPerson();

            const rootOrga: OrganisationID = (await createAndPersistRootOrganisation(em, organisationRepository)).id;

            const callerRole: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrga,
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
            });
            const targetRoleA: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrga,
                rollenart: RollenArt.LEHR,
                systemrechte: [],
            });
            const targetRoleB: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrga,
                rollenart: RollenArt.LEHR,
                systemrechte: [],
            });

            await Promise.all([
                personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: caller.id,
                        organisationId: rootOrga,
                        rolleId: callerRole.id,
                    }),
                ),
                personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: target.id,
                        organisationId: rootOrga,
                        rolleId: targetRoleA.id,
                    }),
                ),
                personenkontextRepoInternal.save(
                    createPersonenkontext(false, {
                        personId: target.id,
                        organisationId: rootOrga,
                        rolleId: targetRoleB.id,
                    }),
                ),
            ]);

            const permissions: IPersonPermissions = createPermissions(caller);
            const hasSystemrechtAtOrganisationSpy: Mock = vi.spyOn(permissions, 'hasSystemrechtAtOrganisation');

            const result: Result<boolean, DomainError> = await sut.hasPersonAnyReadableKontext(target.id, permissions);

            expect(result).toEqual({
                ok: true,
                value: true,
            });
            expect(hasSystemrechtAtOrganisationSpy).toHaveBeenCalledTimes(1);
            expect(hasSystemrechtAtOrganisationSpy).toHaveBeenCalledWith(rootOrga, RollenSystemRecht.PERSONEN_LESEN);

            hasSystemrechtAtOrganisationSpy.mockRestore();
        });

        it('should return MissingPermissionsError if the person has kontexte but the caller cannot read any of them', async () => {
            const caller: Person<true> = await createPerson();
            const target: Person<true> = await createPerson();

            const rootOrga: OrganisationID = (await createAndPersistRootOrganisation(em, organisationRepository)).id;

            const callerRole: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrga,
                rollenart: RollenArt.LEHR,
                systemrechte: [],
            });
            const targetRole: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrga,
                rollenart: RollenArt.LEHR,
                systemrechte: [],
            });

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, { personId: caller.id, organisationId: rootOrga, rolleId: callerRole.id }),
            );
            await personenkontextRepoInternal.save(
                createPersonenkontext(false, { personId: target.id, organisationId: rootOrga, rolleId: targetRole.id }),
            );

            const permissions: IPersonPermissions = createPermissions(caller);

            const result: Result<boolean, DomainError> = await sut.hasPersonAnyReadableKontext(target.id, permissions);

            expect(result).toEqual({
                ok: false,
                error: new MissingPermissionsError('Access denied'),
            });
        });
    });

    describe('isOrganisationAlreadyAssigned', () => {
        it('should return true if there is any personenkontext for an organisation', async () => {
            const person: Person<true> = await createPerson();
            const rolle: Rolle<true> = await createRolle();

            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );
            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    rolleId: rolle.id,
                    personId: person.id,
                    organisationId: organisation.id,
                }),
            );

            const result: boolean = await sut.isOrganisationAlreadyAssigned(organisation.id);
            expect(result).toBeTruthy();
        });
    });

    describe('isRolleAlreadyAssigned', () => {
        it('should return true if there is any personenkontext for a rolle', async () => {
            const person: Person<true> = await createPerson();
            const rolle: Rolle<true> = await createRolle();
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    rolleId: rolle.id,
                    personId: person.id,
                    organisationId: organisation.id,
                }),
            );
            const result: boolean = await sut.isRolleAlreadyAssigned(rolle.id);

            expect(result).toBeTruthy();
        });

        it('should return false if there is no  personenkontext for an organisation', async () => {
            const result: boolean = await sut.isOrganisationAlreadyAssigned(faker.string.uuid());
            expect(result).toBeFalsy();
        });

        it('should return false if there is no  personenkontext for a rolle', async () => {
            const result: boolean = await sut.isRolleAlreadyAssigned(faker.string.uuid());

            expect(result).toBeFalsy();
        });
    });

    describe('getPersonenKontexteWithExpiredBefristung', () => {
        it('should return a grouped list of Personenkontext records with expired befristung', async () => {
            // Create a date 1 day in the past for testing
            const pastDate: Date = new Date();
            pastDate.setDate(pastDate.getDate() - 1);

            const futureDate: Date = new Date();
            futureDate.setDate(futureDate.getDate() + 1);

            const person1: Person<true> = await createPerson();
            const person2: Person<true> = await createPerson();
            const person3: Person<true> = await createPerson();

            const organisation1: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );
            const organisation2: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );

            const rolle1Result: Rolle<true> = await createRolle({
                name: 'rolle1',
                rollenart: RollenArt.EXTERN,
            });

            //Kontexte with exceeding Befristung
            const personenKontext1: Personenkontext<false> = DoFactory.createPersonenkontext(false, {
                personId: person1.id,
                rolleId: rolle1Result.id,
                organisationId: organisation1.id,
                befristung: pastDate,
            });

            const personenKontext2: Personenkontext<false> = DoFactory.createPersonenkontext(false, {
                personId: person2.id,
                rolleId: rolle1Result.id,
                organisationId: organisation1.id,
                befristung: pastDate,
            });

            //Kontexte without exceeding Befristung
            const personenKontext3: Personenkontext<false> = DoFactory.createPersonenkontext(false, {
                personId: person1.id,
                rolleId: rolle1Result.id,
                organisationId: organisation2.id,
                befristung: futureDate,
            });

            const personenKontext4: Personenkontext<false> = DoFactory.createPersonenkontext(false, {
                personId: person2.id,
                rolleId: rolle1Result.id,
                organisationId: organisation2.id,
                befristung: futureDate,
            });

            const personenKontext5: Personenkontext<false> = DoFactory.createPersonenkontext(false, {
                personId: person3.id,
                rolleId: rolle1Result.id,
                organisationId: organisation2.id,
                befristung: futureDate,
            });

            await personenkontextRepoInternal.save(personenKontext1);
            await personenkontextRepoInternal.save(personenKontext2);
            await personenkontextRepoInternal.save(personenKontext3);
            await personenkontextRepoInternal.save(personenKontext4);
            await personenkontextRepoInternal.save(personenKontext5);

            const result: Map<string, Personenkontext<true>[]> = await sut.getPersonenKontexteWithExpiredBefristung();

            expect(result.has(person1.id)).toBe(true);
            expect(result.get(person1.id)).toHaveLength(2);

            expect(result.has(person2.id)).toBe(true);
            expect(result.get(person2.id)).toHaveLength(2);
        });
    });

    describe('getPersonenkontextRollenCount', () => {
        it('should return the correct count of unique persons for a given role', async () => {
            const person: Person<true> = await createPerson();
            const rolle: Rolle<true> = await createRolle();
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    personId: person.id,
                    rolleId: rolle.id,
                    organisationId: organisation.id,
                }),
            );

            const rollenCount: RollenCount[] = await sut.getPersonenkontextRollenCount();
            expect(rollenCount.length).toBe(1);
            if (rollenCount.length > 0) {
                expect(rollenCount[0]!.count).toBe('1');
                expect(rollenCount[0]!.rollenart).toBe(rolle.rollenart);
            } else {
                throw Error();
            }
        });
    });

    describe('hasPersonASystemrechtAtAnyKontextOfPersonB', () => {
        it('should return true if person A has the required systemrecht at any kontext of person B', async () => {
            const personA: Person<true> = await createPerson();
            const personB: Person<true> = await createPerson();

            const rootOrga: OrganisationID = (await createAndPersistRootOrganisation(em, organisationRepository)).id;

            const rolleA: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrga,
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [RollenSystemRecht.PERSONEN_VERWALTEN],
            });
            const rolleB: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrga,
                rollenart: RollenArt.LEHR,
                systemrechte: [],
            });

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, { personId: personA.id, organisationId: rootOrga, rolleId: rolleA.id }),
            );

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, { personId: personB.id, organisationId: rootOrga, rolleId: rolleB.id }),
            );

            const result: boolean = await sut.hasPersonASystemrechtAtAnyKontextOfPersonB(
                personA.id,
                personB.id,
                RollenSystemRecht.PERSONEN_VERWALTEN,
            );

            expect(result).toBe(true);
        });

        it('should return false if person A does not have the required systemrecht at any kontext of person B', async () => {
            const personA: Person<true> = await createPerson();
            const personB: Person<true> = await createPerson();

            const rootOrga: OrganisationID = (await createAndPersistRootOrganisation(em, organisationRepository)).id;

            const rolleA: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrga,
                rollenart: RollenArt.LEHR,
                systemrechte: [],
            });
            const rolleB: Rolle<true> = await createRolle({
                administeredBySchulstrukturknoten: rootOrga,
                rollenart: RollenArt.LEHR,
                systemrechte: [],
            });

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, { personId: personA.id, organisationId: rootOrga, rolleId: rolleA.id }),
            );

            await personenkontextRepoInternal.save(
                createPersonenkontext(false, { personId: personB.id, organisationId: rootOrga, rolleId: rolleB.id }),
            );

            const result: boolean = await sut.hasPersonASystemrechtAtAnyKontextOfPersonB(
                personA.id,
                personB.id,
                RollenSystemRecht.PERSONEN_VERWALTEN,
            );

            expect(result).toBe(false);
        });
    });

    describe('findErweiterteSPByPersonId', () => {
        it('should find pkErweiterungen for this person', async () => {
            const person: Person<true> = await createPerson();
            const rolleA: Rolle<true> = await createRolle();
            const organisationA: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );

            const pk: Personenkontext<true> = await personenkontextRepoInternal.save(
                createPersonenkontext(false, {
                    personId: person.id,
                    rolleId: rolleA.id,
                    organisationId: organisationA.id,
                }),
            );

            const serviceprovider: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            await rollenerweiterungRepo.create(
                DoFactory.createRollenerweiterung(false, {
                    rolleId: rolleA.id,
                    organisationId: organisationA.id,
                    serviceProviderId: serviceprovider.id,
                }),
            );

            const result: ErweiterterServiceProviderForPK[] = await sut.findErweiterteSPByPersonId(person.id);
            expect(result.length).toEqual(1);
            expect(result[0]?.personenkontext.id).toEqual(pk.id);
            expect(result[0]?.serviceProvider.id).toEqual(serviceprovider.id);
        });
    });
});
