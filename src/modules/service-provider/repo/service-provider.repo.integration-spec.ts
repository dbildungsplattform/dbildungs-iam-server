import { faker } from '@faker-js/faker';
import { Collection, EntityManager, MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import { MockedObject } from 'vitest';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import {
    ConfigTestModule,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DoFactory,
    EventSystemTestModule,
    expectErrResult,
    expectOkResult,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { OrganisationID, RolleID } from '../../../shared/types/aggregate-ids.types.js';
import { PermittedOrgas, PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { RolleFactory } from '../../rolle/domain/rolle.factory.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RolleServiceProviderEntity } from '../../rolle/entity/rolle-service-provider.entity.js';
import { RolleEntity } from '../../rolle/entity/rolle.entity.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import {
    ServiceProviderKategorie,
    ServiceProviderMerkmal,
    ServiceProviderTarget,
} from '../domain/service-provider.enum.js';
import { ServiceProvider } from '../domain/service-provider.js';
import { ServiceProviderMerkmalEntity } from './service-provider-merkmal.entity.js';
import { ServiceProviderRollenartWhitelistEntity } from './service-provider-rollenart-whitelist.entity.js';
import { ServiceProviderEntity } from './service-provider.entity.js';
import { ServiceProviderInternalRepo } from './service-provider.internal.repo.js';
import { ServiceProviderPropertyPermissions, ServiceProviderRepo } from './service-provider.repo.js';

describe('ServiceProviderRepo', () => {
    let module: TestingModule;
    let sut: ServiceProviderRepo;

    let orm: MikroORM;
    let em: EntityManager;
    let organisationRepo: OrganisationRepository;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                LoggingTestModule,
                EventSystemTestModule,
            ],
            providers: [
                ServiceProviderRepo,
                ServiceProviderInternalRepo,
                RolleRepo,
                RolleFactory,
                OrganisationRepository,
                {
                    provide: RolleFactory,
                    useValue: createMock(RolleFactory),
                },
            ],
        }).compile();

        sut = module.get(ServiceProviderRepo);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);
        organisationRepo = module.get(OrganisationRepository);

        await DatabaseTestModule.setupDatabase(orm);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

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

    describe('createUnsafe', () => {
        it('should save new service-provider', async () => {
            const serviceProvider: ServiceProvider<false> = DoFactory.createServiceProvider(false, {
                keycloakGroup: faker.string.alphanumeric(),
                keycloakRole: faker.string.alphanumeric(),
                merkmale: [ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR],
                rollenartenWhitelist: [RollenArt.LEHR],
            });

            const createdSp: ServiceProvider<true> = await sut.createUnsafe(serviceProvider);

            expect(createdSp.id).toBeDefined();
            expect(createdSp.merkmale).toEqual(serviceProvider.merkmale);
            expect(createdSp.rollenartenWhitelist).toEqual(serviceProvider.rollenartenWhitelist);
        });

        it('should reject duplicate VIDIS angebot ids for the same school', async () => {
            const providedOnSchulstrukturknoten: string = faker.string.uuid();
            const vidisAngebotId: string = 'vidis-angebot-1';

            await sut.createUnsafe(
                DoFactory.createServiceProvider(false, {
                    name: 'VIDIS Angebot A',
                    providedOnSchulstrukturknoten,
                    vidisAngebotId,
                }),
            );

            await expect(
                sut.createUnsafe(
                    DoFactory.createServiceProvider(false, {
                        name: 'VIDIS Angebot B',
                        providedOnSchulstrukturknoten,
                        vidisAngebotId,
                    }),
                ),
            ).rejects.toThrow();
        });
    });

    describe('findById', () => {
        it('should return the service-provider without logo', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            em.clear();

            const serviceProviderResult: Option<ServiceProvider<true>> = await sut.findById(serviceProvider.id, {
                withLogo: false,
            });

            expect(serviceProviderResult).toBeDefined();
            expect(serviceProviderResult).toBeInstanceOf(ServiceProvider);
            expect(serviceProviderResult?.logo).toBeUndefined();
        });

        it('should return the service-provider with logo', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            const serviceProviderResult: Option<ServiceProvider<true>> = await sut.findById(serviceProvider.id, {
                withLogo: true,
            });

            expect(serviceProviderResult).toBeDefined();
            expect(serviceProviderResult).toBeInstanceOf(ServiceProvider);
            expect(serviceProviderResult?.logo).toBeInstanceOf(Buffer);
        });

        it('should return undefined if the entity does not exist', async () => {
            const serviceProvider: Option<ServiceProvider<true>> = await sut.findById(faker.string.uuid(), {
                withLogo: false,
            });

            expect(serviceProvider).toBeNull();
        });
    });

    describe('findByIds', () => {
        it('should return the service-provider map', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const serviceProviderMap: Map<string, ServiceProvider<true>> = await sut.findByIds([serviceProvider.id]);

            expect(serviceProviderMap).toBeDefined();
        });
    });

    describe('findByOrganisationsWithMerkmale', () => {
        describe.each(['all' as const, [faker.string.uuid()]])(
            'when orgaIds is %s',
            (orgaIds: OrganisationID[] | 'all') => {
                it('should return service-providers filtered by organisations', async () => {
                    const targetOrgaId: string = orgaIds === 'all' ? faker.string.uuid() : orgaIds[0]!;

                    const serviceProviders: ServiceProvider<true>[] = await Promise.all([
                        createAndPersistServiceProvider(em, { providedOnSchulstrukturknoten: targetOrgaId }),
                        createAndPersistServiceProvider(em, {
                            providedOnSchulstrukturknoten: faker.string.uuid(),
                        }),
                    ]);

                    const [serviceProviderResult, count]: Counted<ServiceProvider<true>> =
                        await sut.findByOrganisationsWithMerkmale(orgaIds, { limit: 5, offset: 0 });

                    if (orgaIds === 'all') {
                        expect(serviceProviderResult).toHaveLength(serviceProviders.length);
                        expect(count).toEqual(serviceProviders.length);
                    } else {
                        expect(serviceProviderResult).toHaveLength(1);
                        expect(serviceProviderResult[0]!.id).toEqual(serviceProviders[0]!.id);
                        expect(count).toEqual(1);
                    }
                });
            },
        );

        it('should filter by kategorie', async () => {
            const [emailServiceProvider, unterrichtServiceProvider]: [ServiceProvider<true>, ServiceProvider<true>] =
                await Promise.all([
                    createAndPersistServiceProvider(em, { kategorie: ServiceProviderKategorie.EMAIL }),
                    createAndPersistServiceProvider(em, { kategorie: ServiceProviderKategorie.UNTERRICHT }),
                ]);

            const [emailResult, emailCount]: Counted<ServiceProvider<true>> = await sut.findByOrganisationsWithMerkmale(
                'all',
                { kategorien: [ServiceProviderKategorie.EMAIL] },
            );
            expect(emailResult).toHaveLength(1);
            expect(emailResult[0]!.id).toEqual(emailServiceProvider.id);
            expect(emailCount).toEqual(1);

            const [unterrichtResult, unterrichtCount]: Counted<ServiceProvider<true>> =
                await sut.findByOrganisationsWithMerkmale('all', {
                    kategorien: [ServiceProviderKategorie.UNTERRICHT],
                });
            expect(unterrichtResult).toHaveLength(1);
            expect(unterrichtResult[0]!.id).toEqual(unterrichtServiceProvider.id);
            expect(unterrichtCount).toEqual(1);
        });

        describe('when searchFilter is provided', () => {
            it('should filter by searchFilter matching the name case-insensitively', async () => {
                const [matchingServiceProvider]: [ServiceProvider<true>, ServiceProvider<true>] = await Promise.all([
                    createAndPersistServiceProvider(em, { name: 'Alpha Angebot' }),
                    createAndPersistServiceProvider(em, { name: 'Beta Angebot' }),
                ]);
                em.clear();

                const [result, count]: Counted<ServiceProvider<true>> = await sut.findByOrganisationsWithMerkmale(
                    'all',
                    {
                        searchFilter: 'alpha',
                    },
                );

                expect(result).toHaveLength(1);
                expect(result[0]!.id).toEqual(matchingServiceProvider.id);
                expect(count).toEqual(1);
            });

            it('should filter by searchFilter matching a substring of the name', async () => {
                const [matchingServiceProvider]: [ServiceProvider<true>, ServiceProvider<true>] = await Promise.all([
                    createAndPersistServiceProvider(em, { name: 'Gamma Portal' }),
                    createAndPersistServiceProvider(em, { name: 'Delta Portal' }),
                ]);
                em.clear();

                const [result, count]: Counted<ServiceProvider<true>> = await sut.findByOrganisationsWithMerkmale(
                    'all',
                    {
                        searchFilter: 'Gamma',
                    },
                );

                expect(result).toHaveLength(1);
                expect(result[0]!.id).toEqual(matchingServiceProvider.id);
                expect(count).toEqual(1);
            });

            it('should return no results when searchFilter matches no name', async () => {
                await Promise.all([
                    createAndPersistServiceProvider(em, { name: 'Alpha Angebot' }),
                    createAndPersistServiceProvider(em, { name: 'Beta Angebot' }),
                ]);
                em.clear();

                const [result, count]: Counted<ServiceProvider<true>> = await sut.findByOrganisationsWithMerkmale(
                    'all',
                    {
                        searchFilter: 'nonexistent',
                    },
                );

                expect(result).toHaveLength(0);
                expect(count).toEqual(0);
            });

            it('should combine searchFilter with kategorie filter', async () => {
                const [matchingServiceProvider]: [ServiceProvider<true>, ServiceProvider<true>, ServiceProvider<true>] =
                    await Promise.all([
                        createAndPersistServiceProvider(em, {
                            name: 'Alpha Angebot',
                            kategorie: ServiceProviderKategorie.EMAIL,
                        }),
                        createAndPersistServiceProvider(em, {
                            name: 'Alpha Angebot',
                            kategorie: ServiceProviderKategorie.UNTERRICHT,
                        }),
                        createAndPersistServiceProvider(em, {
                            name: 'Beta Angebot',
                            kategorie: ServiceProviderKategorie.EMAIL,
                        }),
                    ]);
                em.clear();

                const [result, count]: Counted<ServiceProvider<true>> = await sut.findByOrganisationsWithMerkmale(
                    'all',
                    {
                        searchFilter: 'alpha',
                        kategorien: [ServiceProviderKategorie.EMAIL],
                    },
                );

                expect(result).toHaveLength(1);
                expect(result[0]!.id).toEqual(matchingServiceProvider.id);
                expect(count).toEqual(1);
            });

            it('should treat the "_" in the searchFilter literally instead of as a wildcard', async () => {
                const [matchingServiceProvider]: [ServiceProvider<true>, ServiceProvider<true>] = await Promise.all([
                    createAndPersistServiceProvider(em, { name: 'A_B' }),
                    createAndPersistServiceProvider(em, { name: 'AXB' }),
                ]);
                em.clear();

                const [result, count]: Counted<ServiceProvider<true>> = await sut.findByOrganisationsWithMerkmale(
                    'all',
                    {
                        searchFilter: 'A_B',
                    },
                );

                expect(result).toHaveLength(1);
                expect(result[0]!.id).toEqual(matchingServiceProvider.id);
                expect(count).toEqual(1);
            });

            it('should treat the "%" in the searchFilter literally instead of as a wildcard', async () => {
                const [matchingServiceProvider]: [ServiceProvider<true>, ServiceProvider<true>] = await Promise.all([
                    createAndPersistServiceProvider(em, { name: '50% Rabatt' }),
                    createAndPersistServiceProvider(em, { name: '50 Cent' }),
                ]);
                em.clear();

                const [result, count]: Counted<ServiceProvider<true>> = await sut.findByOrganisationsWithMerkmale(
                    'all',
                    {
                        searchFilter: '50%',
                    },
                );

                expect(result).toHaveLength(1);
                expect(result[0]!.id).toEqual(matchingServiceProvider.id);
                expect(count).toEqual(1);
            });

            it('should treat the "\\" in the searchFilter literally instead of as an escape character', async () => {
                const [matchingServiceProvider]: [ServiceProvider<true>, ServiceProvider<true>] = await Promise.all([
                    createAndPersistServiceProvider(em, { name: 'C:\\Temp' }),
                    createAndPersistServiceProvider(em, { name: 'C:Temp' }),
                ]);
                em.clear();

                const [result, count]: Counted<ServiceProvider<true>> = await sut.findByOrganisationsWithMerkmale(
                    'all',
                    {
                        searchFilter: 'C:\\Temp',
                    },
                );

                expect(result).toHaveLength(1);
                expect(result[0]!.id).toEqual(matchingServiceProvider.id);
                expect(count).toEqual(1);
            });
        });

        it('should respect the limit and offset', async () => {
            const total: number = 10;
            await Promise.all(Array.from({ length: total }, () => createAndPersistServiceProvider(em)));

            const limit: number = 5;
            const [serviceProviderWithoutOffsetResult, countWithoutOffset]: Counted<ServiceProvider<true>> =
                await sut.findByOrganisationsWithMerkmale('all', { limit, offset: 0 });
            expect(serviceProviderWithoutOffsetResult).toHaveLength(limit);
            expect(countWithoutOffset).toEqual(total);

            const [serviceProviderWithOffsetResult, countWithOffset]: Counted<ServiceProvider<true>> =
                await sut.findByOrganisationsWithMerkmale('all', { limit, offset: 5 });
            expect(serviceProviderWithOffsetResult).toHaveLength(limit);
            expect(countWithOffset).toEqual(total);

            for (let index: number = 0; index < limit; index++) {
                expect(serviceProviderWithOffsetResult[index]!.id).not.toEqual(
                    serviceProviderWithoutOffsetResult[index]!.id,
                );
            }
        });

        it('should have the correct order', async () => {
            await Promise.all(
                Array.from(
                    [
                        ServiceProviderKategorie.VERWALTUNG,
                        ServiceProviderKategorie.HINWEISE,
                        ServiceProviderKategorie.EMAIL,
                        ServiceProviderKategorie.UNTERRICHT,
                    ],
                    (kategorie: ServiceProviderKategorie) => createAndPersistServiceProvider(em, { kategorie }),
                ),
            );

            const [serviceProviderResult]: Counted<ServiceProvider<true>> = await sut.findByOrganisationsWithMerkmale(
                'all',
                { limit: 5, offset: 0 },
            );

            [
                ServiceProviderKategorie.EMAIL,
                ServiceProviderKategorie.UNTERRICHT,
                ServiceProviderKategorie.VERWALTUNG,
                ServiceProviderKategorie.HINWEISE,
            ].forEach((kategorie: ServiceProviderKategorie, index: number) => {
                expect(serviceProviderResult[index]!.kategorie).toBe(kategorie);
            });
        });
    });

    describe('findByIdForOrganisationIds', () => {
        let organisationA: Organisation<true>;
        let organisationB: Organisation<true>;
        let serviceProvider: ServiceProvider<true>;

        beforeEach(async () => {
            organisationA = await organisationRepo.save(DoFactory.createOrganisation(false));
            organisationB = await organisationRepo.save(DoFactory.createOrganisation(false));

            serviceProvider = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: organisationA.id,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should return the service provider when administriert at organisation', async () => {
            const result: Option<ServiceProvider<true>> = await sut.findByIdForOrganisationIds(serviceProvider.id, [
                organisationA.id,
            ]);

            expect(result).not.toBeNull();
            expect(result!.id).toEqual(serviceProvider.id);

            expect(result!.merkmale.length).toBeGreaterThan(0);
        });

        it('should return null when the ID exists but organisationIds do not include the provider’s org', async () => {
            const result: Option<ServiceProvider<true>> = await sut.findByIdForOrganisationIds(serviceProvider.id, [
                organisationB.id,
            ]);

            expect(result).toBeNull();
        });

        it('should return null when the service provider does not exist', async () => {
            const result: Option<ServiceProvider<true>> = await sut.findByIdForOrganisationIds(faker.string.uuid(), [
                organisationA.id,
            ]);

            expect(result).toBeNull();
        });

        it('should return null when organisationIds list is empty', async () => {
            const result: Option<ServiceProvider<true>> = await sut.findByIdForOrganisationIds(serviceProvider.id, []);

            expect(result).toBeNull();
        });

        it('should return the provider when multiple organisationIds are passed and one matches', async () => {
            const result: Option<ServiceProvider<true>> = await sut.findByIdForOrganisationIds(serviceProvider.id, [
                organisationB.id,
                organisationA.id,
            ]);

            expect(result).not.toBeNull();
            expect(result!.id).toEqual(serviceProvider.id);
        });
    });

    describe('findByOrgasWithMerkmal', () => {
        it('returns only service-providers for the given organisation ids that have the rollenerweiterung merkmal', async () => {
            const orgId: string = faker.string.uuid();

            const [persistedWithMerkmal]: ServiceProvider<true>[] = await Promise.all([
                createAndPersistServiceProvider(em, {
                    providedOnSchulstrukturknoten: orgId,
                    merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                }),
                createAndPersistServiceProvider(em, {
                    providedOnSchulstrukturknoten: orgId,
                }),
                createAndPersistServiceProvider(em, {
                    providedOnSchulstrukturknoten: faker.string.uuid(),
                    merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                }),
            ]);

            em.clear();

            const [result, count]: Counted<ServiceProvider<true>> = await sut.findByOrgasWithMerkmal(
                [orgId],
                ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                5,
                0,
            );

            expect(count).toEqual(1);
            expect(result).toHaveLength(1);
            expect(result[0]!.id).toEqual(persistedWithMerkmal!.id);
        });

        it('respects limit and offset for results that match organisation ids and merkmal', async () => {
            const orgId: string = faker.string.uuid();
            const total: number = 10;

            await Promise.all(
                Array.from({ length: total }, () =>
                    createAndPersistServiceProvider(em, {
                        providedOnSchulstrukturknoten: orgId,
                        merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                    }),
                ),
            );

            const limit: number = 5;
            const [withoutOffsetResult, countWithoutOffset]: Counted<ServiceProvider<true>> =
                await sut.findByOrgasWithMerkmal(
                    [orgId],
                    ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                    limit,
                    0,
                );
            expect(withoutOffsetResult).toHaveLength(limit);
            expect(countWithoutOffset).toEqual(total);

            const [withOffsetResult, countWithOffset]: Counted<ServiceProvider<true>> =
                await sut.findByOrgasWithMerkmal(
                    [orgId],
                    ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                    limit,
                    5,
                );
            expect(withOffsetResult).toHaveLength(limit);
            expect(countWithOffset).toEqual(total);

            for (let index: number = 0; index < limit; index++) {
                expect(withOffsetResult[index]!.id).not.toEqual(withoutOffsetResult[index]!.id);
            }
        });

        it('should have the correct order', async () => {
            const orgId: string = faker.string.uuid();
            await Promise.all(
                [
                    ServiceProviderKategorie.VERWALTUNG,
                    ServiceProviderKategorie.HINWEISE,
                    ServiceProviderKategorie.EMAIL,
                    ServiceProviderKategorie.UNTERRICHT,
                ].map((kategorie: ServiceProviderKategorie) =>
                    createAndPersistServiceProvider(em, {
                        kategorie,
                        providedOnSchulstrukturknoten: orgId,
                        merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                    }),
                ),
            );

            const [serviceProviderResult]: Counted<ServiceProvider<true>> = await sut.findByOrgasWithMerkmal(
                [orgId],
                ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                5,
                0,
            );

            [
                ServiceProviderKategorie.EMAIL,
                ServiceProviderKategorie.UNTERRICHT,
                ServiceProviderKategorie.VERWALTUNG,
                ServiceProviderKategorie.HINWEISE,
            ].forEach((kategorie: ServiceProviderKategorie, index: number) => {
                expect(serviceProviderResult[index]!.kategorie).toBe(kategorie);
            });
        });
    });

    describe('findAuthorizedById', () => {
        describe.each([
            {
                all: true,
            } satisfies PermittedOrgas,
            {
                all: false,
                orgaIds: [faker.string.uuid()],
            } satisfies PermittedOrgas,
        ])('when permissions are %s', (permittedOrgas: PermittedOrgas) => {
            it('should return service-provider if the user is allowed to manage it', async () => {
                const permittedOrgaIds: string[] = permittedOrgas.all ? [faker.string.uuid()] : permittedOrgas.orgaIds;

                const serviceProviders: ServiceProvider<true>[] = await Promise.all([
                    createAndPersistServiceProvider(em, { providedOnSchulstrukturknoten: permittedOrgaIds[0] }),
                    createAndPersistServiceProvider(em, { providedOnSchulstrukturknoten: faker.string.uuid() }),
                ]);

                const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
                permissions.getOrgIdsWithSystemrecht = vi.fn().mockReturnValue(permittedOrgas);
                const serviceProviderResult: Option<ServiceProvider<true>> = await sut.findAuthorizedById(
                    permissions,
                    serviceProviders[0]!.id,
                );
                const otherServiceProviderResult: Option<ServiceProvider<true>> = await sut.findAuthorizedById(
                    permissions,
                    serviceProviders[1]!.id,
                );

                expect(serviceProviderResult).toBeDefined();
                expect(serviceProviderResult?.id).toBe(serviceProviders[0]!.id);
                if (permittedOrgas.all) {
                    expect(otherServiceProviderResult).toBeDefined();
                } else {
                    expect(otherServiceProviderResult).toBeNull();
                }
            });
        });
    });

    describe('findByName', () => {
        it('should find a ServiceProvider by its name if a ServiceProvider with the given name exists', async () => {
            const expectedServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            const actualServiceProvider: Option<ServiceProvider<true>> = await sut.findByName(
                expectedServiceProvider.name,
            );

            expect(actualServiceProvider).toEqual(expectedServiceProvider);
        });

        it('should throw an error if there are no existing ServiceProviders for the given name', async () => {
            await createAndPersistServiceProvider(em);

            const result: Option<ServiceProvider<true>> = await sut.findByName('this-service-provider-does-not-exist');

            expect(result).toBeFalsy();
        });
    });

    describe('findByVidisAngebotId', () => {
        it('should find a ServiceProvider by its VIDIS Angebot ID', async () => {
            const expectedVidisAngebotId: string = '1234567';
            const expectedPersistedServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                vidisAngebotId: expectedVidisAngebotId,
            });
            await createAndPersistServiceProvider(em, { vidisAngebotId: '7777777' });

            const actualServiceProvider: Option<ServiceProvider<true>> =
                await sut.findByVidisAngebotId(expectedVidisAngebotId);

            expect(actualServiceProvider).toEqual(expectedPersistedServiceProvider);
        });

        it('should return null if there are no existing ServiceProviders for the given VIDIS Angebot ID', async () => {
            await createAndPersistServiceProvider(em, { vidisAngebotId: '1234567' });

            const result: Option<ServiceProvider<true>> = await sut.findByVidisAngebotId('7777777');

            expect(result).toBeFalsy();
        });
    });

    describe('findVidisAngeboteforSchools', () => {
        it('should return service providers for the given schools that have a VIDIS Angebot ID', async () => {
            const schoolAId: OrganisationID = faker.string.uuid();
            const schoolBId: OrganisationID = faker.string.uuid();

            const matchingServiceProviderA: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: schoolAId,
                vidisAngebotId: 'vidis-angebot-1',
            });
            const matchingServiceProviderB: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: schoolBId,
                vidisAngebotId: 'vidis-angebot-2',
            });
            await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: schoolAId,
            });
            await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: faker.string.uuid(),
                vidisAngebotId: 'vidis-angebot-3',
            });

            const result: ServiceProvider<true>[] = await sut.findVidisAngeboteforSchools([schoolAId, schoolBId]);

            expect(result).toHaveLength(2);
            expect(result).toEqual(expect.arrayContaining([matchingServiceProviderA, matchingServiceProviderB]));
        });

        it('should include logos when requested', async () => {
            const schoolId: OrganisationID = faker.string.uuid();
            const logo: Buffer = Buffer.from('89504e470d0a1a0a0001', 'hex');

            await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: schoolId,
                vidisAngebotId: 'vidis-angebot-with-logo',
                logo,
                logoMimeType: 'image/png',
            });

            const [result]: ServiceProvider<true>[] = await sut.findVidisAngeboteforSchools([schoolId], {
                withLogo: true,
            });

            expect(result?.logo).toEqual(logo);
            expect(result?.logoMimeType).toBe('image/png');
        });

        it('should return an empty array for an empty school list', async () => {
            const result: ServiceProvider<true>[] = await sut.findVidisAngeboteforSchools([]);

            expect(result).toEqual([]);
        });
    });

    describe('findNonSchoolProvidedVidisAngebote', () => {
        it('should return only VIDIS offers that are not provided on school organisations', async () => {
            const school: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );
            const nonSchool: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.LAND }),
            );

            const expectedServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: nonSchool.id,
                vidisAngebotId: 'vidis-angebot-non-school',
            });
            await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: school.id,
                vidisAngebotId: 'vidis-angebot-school',
            });
            await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: nonSchool.id,
            });

            const result: ServiceProvider<true>[] = await sut.findNonSchoolProvidedVidisAngebote();

            expect(result).toEqual([expectedServiceProvider]);
        });
    });

    describe('findByKeycloakGroup', () => {
        it('should find a ServiceProvider by its Keycloak groupname', async () => {
            const expectedPersistedServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                keycloakGroup: 'keycloak-group-1',
            });
            await createAndPersistServiceProvider(em, { keycloakGroup: 'keycloak-group-2' });

            let result: ServiceProvider<true>[] = [];
            if (expectedPersistedServiceProvider.keycloakGroup) {
                result = await sut.findByKeycloakGroup(expectedPersistedServiceProvider.keycloakGroup);
            }

            expect(result).toEqual([expectedPersistedServiceProvider]);
        });
    });

    describe('findBySchulstrukturknoten', () => {
        it('should return the service provider', async () => {
            const providedOnSchulstrukturknoten: string = faker.string.uuid();
            const persistedServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten,
            });
            em.clear();
            const result: ServiceProvider<true>[] = await sut.findBySchulstrukturknoten([
                providedOnSchulstrukturknoten,
            ]);

            expect(result).toHaveLength(1);
            expect(result).toEqual(
                expect.arrayContaining([
                    {
                        ...persistedServiceProvider,
                        logo: undefined,
                    },
                ]),
            );
        });
    });

    describe('findBySchulstrukturknotenPaginated', () => {
        const setup = async (): Promise<{
            orgAId: string;
            orgBId: string;
            serviceProviderAlphaOrgA: ServiceProvider<true>;
            serviceProviderBetaOrgA: ServiceProvider<true>;
            serviceProviderGammaOrgB: ServiceProvider<true>;
        }> => {
            const orgAId: string = faker.string.uuid();
            const orgBId: string = faker.string.uuid();
            const serviceProviderAlphaOrgA: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: orgAId,
                name: 'Alpha',
            });
            const serviceProviderBetaOrgA: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: orgAId,
                name: 'Beta',
            });
            const serviceProviderGammaOrgB: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: orgBId,
                name: 'Gamma',
            });
            em.clear();

            return {
                orgAId,
                orgBId,
                serviceProviderAlphaOrgA,
                serviceProviderBetaOrgA,
                serviceProviderGammaOrgB,
            };
        };

        it('should return matching service providers with count', async () => {
            const {
                orgAId,
                serviceProviderAlphaOrgA,
                serviceProviderBetaOrgA,
            }: {
                orgAId: string;
                serviceProviderAlphaOrgA: ServiceProvider<true>;
                serviceProviderBetaOrgA: ServiceProvider<true>;
            } = await setup();

            const [results, count]: Counted<ServiceProvider<true>> = await sut.findBySchulstrukturknotenPaginated([
                orgAId,
            ]);

            expect(count).toBe(2);
            expect(results).toHaveLength(2);
            expect(results.map((sp: ServiceProvider<true>) => sp.id)).toEqual(
                expect.arrayContaining([serviceProviderAlphaOrgA.id, serviceProviderBetaOrgA.id]),
            );
        });

        it('should filter by searchQuery case-insensitively', async () => {
            const {
                orgAId,
                serviceProviderAlphaOrgA,
            }: {
                orgAId: string;
                serviceProviderAlphaOrgA: ServiceProvider<true>;
            } = await setup();

            const [results, count]: Counted<ServiceProvider<true>> = await sut.findBySchulstrukturknotenPaginated(
                [orgAId],
                'ALPHA',
            );

            expect(count).toBe(1);
            expect(results[0]!.id).toBe(serviceProviderAlphaOrgA.id);
        });

        it('should not return service providers from other organisations', async () => {
            const {
                orgAId,
                serviceProviderAlphaOrgA,
                serviceProviderBetaOrgA,
                serviceProviderGammaOrgB,
            }: {
                orgAId: string;
                serviceProviderAlphaOrgA: ServiceProvider<true>;
                serviceProviderBetaOrgA: ServiceProvider<true>;
                serviceProviderGammaOrgB: ServiceProvider<true>;
            } = await setup();

            const [results, count]: Counted<ServiceProvider<true>> = await sut.findBySchulstrukturknotenPaginated([
                orgAId,
            ]);

            expect(count).toBe(2);
            const resultIds: string[] = results.map((sp: ServiceProvider<true>) => sp.id);
            expect(resultIds).toEqual(
                expect.arrayContaining([serviceProviderAlphaOrgA.id, serviceProviderBetaOrgA.id]),
            );
            expect(resultIds).not.toContain(serviceProviderGammaOrgB.id);
        });

        it('should apply limit and offset', async () => {
            const {
                orgAId,
                orgBId,
            }: {
                orgAId: string;
                orgBId: string;
            } = await setup();

            const [results, count]: Counted<ServiceProvider<true>> = await sut.findBySchulstrukturknotenPaginated(
                [orgAId, orgBId],
                undefined,
                2,
                1,
            );

            expect(count).toBe(3);
            expect(results).toHaveLength(2);
        });

        it('should order results by name ascending', async () => {
            const {
                orgAId,
                serviceProviderAlphaOrgA,
                serviceProviderBetaOrgA,
            }: {
                orgAId: string;
                serviceProviderAlphaOrgA: ServiceProvider<true>;
                serviceProviderBetaOrgA: ServiceProvider<true>;
            } = await setup();

            const [results]: Counted<ServiceProvider<true>> = await sut.findBySchulstrukturknotenPaginated([orgAId]);

            expect(results[0]!.name).toBe(serviceProviderAlphaOrgA.name);
            expect(results[1]!.name).toBe(serviceProviderBetaOrgA.name);
        });

        describe('when searchQuery contains SQL wildcard characters', () => {
            const setup = async (): Promise<{
                orgId: string;
                spWithPercent: ServiceProvider<true>;
                spWithUnderscore: ServiceProvider<true>;
                spOther: ServiceProvider<true>;
            }> => {
                const orgId: string = faker.string.uuid();
                const spWithPercent: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    providedOnSchulstrukturknoten: orgId,
                    name: '100% Service',
                });
                const spWithUnderscore: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    providedOnSchulstrukturknoten: orgId,
                    name: 'class_A Service',
                });
                const spOther: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    providedOnSchulstrukturknoten: orgId,
                    name: 'Other Service',
                });
                em.clear();

                return { orgId, spWithPercent, spWithUnderscore, spOther };
            };

            it('should treat % as a literal character', async () => {
                const { orgId, spWithPercent, spWithUnderscore, spOther }: Awaited<ReturnType<typeof setup>> =
                    await setup();

                const [results]: Counted<ServiceProvider<true>> = await sut.findBySchulstrukturknotenPaginated(
                    [orgId],
                    '%',
                );

                const ids: string[] = results.map((sp: ServiceProvider<true>) => sp.id);
                expect(ids).toContain(spWithPercent.id);
                expect(ids).not.toContain(spWithUnderscore.id);
                expect(ids).not.toContain(spOther.id);
            });

            it('should treat _ as a literal character', async () => {
                const { orgId, spWithPercent, spWithUnderscore, spOther }: Awaited<ReturnType<typeof setup>> =
                    await setup();

                const [results]: Counted<ServiceProvider<true>> = await sut.findBySchulstrukturknotenPaginated(
                    [orgId],
                    '_',
                );

                const ids: string[] = results.map((sp: ServiceProvider<true>) => sp.id);
                expect(ids).toContain(spWithUnderscore.id);
                expect(ids).not.toContain(spWithPercent.id);
                expect(ids).not.toContain(spOther.id);
            });
        });
    });

    describe('fetchRolleServiceProvidersWithoutPerson', () => {
        it('should define serviceProviderResult', async () => {
            const role: RolleID = faker.string.uuid();
            const serviceProviderResult: ServiceProvider<true>[] = await sut.fetchRolleServiceProvidersWithoutPerson([
                role,
            ]);
            expect(serviceProviderResult).toBeDefined();
        });

        it('should correctly map RolleServiceProviderEntity to ServiceProvider', async () => {
            // Arrange
            const roleId: RolleID = faker.string.uuid();

            const serviceProviderEntityMock: ServiceProviderEntity = createMock(ServiceProviderEntity, {
                id: faker.string.uuid(),
                name: faker.company.name(),
                target: ServiceProviderTarget.SCHULPORTAL_ADMINISTRATION,
                providedOnSchulstrukturknoten: faker.string.uuid(),
                kategorie: ServiceProviderKategorie.VERWALTUNG,
            });

            serviceProviderEntityMock.merkmale = {
                map: <T>(callback: (item: ServiceProviderMerkmalEntity) => T) => [
                    callback({
                        merkmal: ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR,
                    } as ServiceProviderMerkmalEntity),
                ],
            } as unknown as Collection<ServiceProviderMerkmalEntity>;
            serviceProviderEntityMock.rollenartenWhitelist = {
                map: <T>(callback: (item: ServiceProviderRollenartWhitelistEntity) => T) => [
                    callback({
                        rollenart: RollenArt.LEHR,
                    } as ServiceProviderRollenartWhitelistEntity),
                ],
            } as unknown as Collection<ServiceProviderRollenartWhitelistEntity>;

            const rolleServiceProviderEntityMock: RolleServiceProviderEntity = {
                rolle: { id: roleId } as RolleEntity,
                serviceProvider: serviceProviderEntityMock,
            } as RolleServiceProviderEntity;

            vi.spyOn(em, 'find').mockResolvedValue([rolleServiceProviderEntityMock]);

            const result: ServiceProvider<true>[] = await sut.fetchRolleServiceProvidersWithoutPerson(roleId);

            expect(result).toBeDefined();
            expect(result[0]?.rollenartenWhitelist).toEqual([RollenArt.LEHR]);
            expect(em.find).toHaveBeenCalledWith(
                RolleServiceProviderEntity,
                { rolle: { id: roleId } },
                {
                    populate: [
                        'serviceProvider',
                        'serviceProvider.merkmale',
                        'serviceProvider.rollenartenWhitelist',
                        'rolle',
                        'rolle.personenKontexte',
                    ],
                },
            );
        });
    });

    describe('deleteByIdAuthorized', () => {
        let organisation: Organisation<true>;
        let serviceProvider: ServiceProvider<true>;

        beforeEach(async () => {
            organisation = await organisationRepo.save(DoFactory.createOrganisation(false));
            serviceProvider = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: organisation.id,
            });
        });

        it('should delete the service provider if the user has permissions for the organisation', async () => {
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const result: Result<void, EntityNotFoundError | MissingPermissionsError> = await sut.deleteByIdAuthorized(
                permissionsMock,
                serviceProvider.id,
            );

            expectOkResult(result);
            await expect(em.findOneOrFail(ServiceProviderEntity, { id: serviceProvider.id })).rejects.toThrow();
        });

        it('should throw error if the service provider does not exist', async () => {
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const result: Result<void, EntityNotFoundError | MissingPermissionsError> = await sut.deleteByIdAuthorized(
                permissionsMock,
                faker.string.uuid(),
            );

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
            await expect(em.findOneOrFail(ServiceProviderEntity, { id: serviceProvider.id })).resolves.toBeDefined();
        });

        it('should not delete the service provider if the user does not have permissions for the organisation', async () => {
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<void, EntityNotFoundError | MissingPermissionsError> = await sut.deleteByIdAuthorized(
                permissionsMock,
                serviceProvider.id,
            );

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            await expect(em.findOneOrFail(ServiceProviderEntity, { id: serviceProvider.id })).resolves.toBeDefined();
        });
    });

    describe('getPermissionsForServiceProvider', () => {
        it.each([
            [RollenSystemRecht.ANGEBOTE_VERWALTEN, ServiceProviderPropertyPermissions.ALL],
            [RollenSystemRecht.ANGEBOTE_EINGESCHRAENKT_VERWALTEN, ServiceProviderPropertyPermissions.EINGESCHRAENKT],
        ])(
            'when systemrecht is %s, it should return %s',
            async (
                systemrecht: RollenSystemRecht,
                serviceProviderPropertyPermission: ServiceProviderPropertyPermissions,
            ) => {
                const sp: ServiceProvider<true> = DoFactory.createServiceProvider(true);
                const permissionsMock: MockedObject<PersonPermissions> =
                    createMock<PersonPermissions>(PersonPermissions);
                permissionsMock.hasSystemrechtAtOrganisation.mockImplementation(
                    (_orgaId: OrganisationID, sr: RollenSystemRecht) => Promise.resolve(sr === systemrecht),
                );
                const result: Result<ServiceProviderPropertyPermissions, DomainError> =
                    await sut.getPermissionsForServiceProvider(permissionsMock, sp);
                expectOkResult(result);
                expect(result.value).toBe(serviceProviderPropertyPermission);
            },
        );

        it('should return error if no permissions exist', async () => {
            const sp: ServiceProvider<true> = DoFactory.createServiceProvider(true);
            const permissionsMock: MockedObject<PersonPermissions> = createMock<PersonPermissions>(PersonPermissions);
            permissionsMock.hasSystemrechtAtOrganisation.mockReturnValue(Promise.resolve(false));
            const result: Result<ServiceProviderPropertyPermissions, DomainError> =
                await sut.getPermissionsForServiceProvider(permissionsMock, sp);
            expectErrResult(result);
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
        });
    });
});
