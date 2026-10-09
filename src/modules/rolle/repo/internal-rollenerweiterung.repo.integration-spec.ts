import { EntityManager, MikroORM, UniqueConstraintViolationException } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';

import { faker } from '@faker-js/faker';
import { Mock } from 'vitest';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { createMock } from '../../../../test/utils/createMock.js';
import { DatabaseTestModule } from '../../../../test/utils/database-test.module.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { expectOkResult } from '../../../../test/utils/index.js';
import { LoggingTestModule } from '../../../../test/utils/logging-test.module.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { DEFAULT_TIMEOUT_FOR_TESTCONTAINERS } from '../../../../test/utils/timeouts.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { OrganisationID, ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderModule } from '../../service-provider/service-provider.module.js';
import { RollenArt } from '../domain/rolle.enums.js';
import { RolleFactory } from '../domain/rolle.factory.js';
import { Rolle } from '../domain/rolle.js';
import { RollenerweiterungFactory } from '../domain/rollenerweiterung.factory.js';
import { Rollenerweiterung } from '../domain/rollenerweiterung.js';
import { RollenerweiterungEntity } from '../entity/rollenerweiterung.entity.js';
import { InternalRollenerweiterungRepo } from './internal-rollenerweiterung.repo.js';
import { RolleRepo } from './rolle.repo.js';

function makeN<T>(fn: () => T, n: number): Array<T> {
    return Array.from({ length: n }, fn);
}

describe('InternalRollenerweiterungRepo', () => {
    let module: TestingModule;
    let sut: InternalRollenerweiterungRepo;
    let orm: MikroORM;
    let em: EntityManager;
    let organisationRepo: OrganisationRepository;
    let rolleRepo: RolleRepo;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigTestModule,
                LoggingTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                ServiceProviderModule,
            ],
            providers: [
                RolleRepo,
                RolleFactory,
                InternalRollenerweiterungRepo,
                RollenerweiterungFactory,
                OrganisationRepository,
                EventRoutingLegacyKafkaService,
            ],
        })
            .overrideProvider(EventRoutingLegacyKafkaService)
            .useValue(createMock(EventRoutingLegacyKafkaService))
            .compile();

        sut = module.get(InternalRollenerweiterungRepo);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);
        organisationRepo = module.get(OrganisationRepository);
        rolleRepo = module.get(RolleRepo);

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

    function createValidRollenerweiterung(
        organisation: Organisation<true>,
        rolle: Rolle<true>,
        serviceProvider: ServiceProvider<true>,
    ): Rollenerweiterung<false> {
        const result: Result<Rollenerweiterung<false>, DomainError> = Rollenerweiterung.createNew(
            organisation.id,
            rolle,
            serviceProvider,
        );

        if (!result.ok) {
            throw result.error;
        }
        return result.value;
    }

    describe('exists', () => {
        let organisation: Organisation<true>;
        let rolle: Rolle<true>;
        let serviceProvider: ServiceProvider<true>;
        beforeEach(async () => {
            organisation = await organisationRepo.save(DoFactory.createOrganisation(false));
            const rolleOrError: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            if (rolleOrError instanceof DomainError) {
                throw new Error('Failed to create Rolle');
            }
            rolle = rolleOrError;
            serviceProvider = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });
        });

        it.each([
            ['exists', true],
            ['does not exist', false],
        ])('if rollenerweiterung %s, it should return %s', async (_label: string, expected: boolean) => {
            if (expected) {
                const entity: RollenerweiterungEntity = em.create(RollenerweiterungEntity, {
                    organisationId: organisation.id,
                    rolleId: rolle.id,
                    serviceProviderId: serviceProvider.id,
                });
                await em.persist(entity).flush();
            }
            const result: boolean = await sut.exists({
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });
            expect(result).toBe(expected);
        });

        it('should return false if only organisationId and rolleId match', async () => {
            const otherServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });

            await sut.create(createValidRollenerweiterung(organisation, rolle, serviceProvider));

            const result: boolean = await sut.exists({
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: otherServiceProvider.id,
            });

            expect(result).toBe(false);
        });
    });

    describe('create', () => {
        let organisation: Organisation<true>;
        let rolle: Rolle<true>;
        let serviceProvider: ServiceProvider<true>;

        beforeEach(async () => {
            organisation = await organisationRepo.save(DoFactory.createOrganisation(false));
            const rolleOrError: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            if (rolleOrError instanceof DomainError) {
                throw new Error('Failed to create Rolle');
            }
            rolle = rolleOrError;
            serviceProvider = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should create rollenerweiterung', async () => {
            const rollenerweiterung: Rollenerweiterung<false> = createValidRollenerweiterung(
                organisation,
                rolle,
                serviceProvider,
            );
            const createResult: Rollenerweiterung<true> = await sut.create(rollenerweiterung);

            expect(createResult).toBeInstanceOf(Rollenerweiterung);
            expect(createResult).toEqual(
                expect.objectContaining({
                    organisationId: organisation.id,
                    rolleId: rolle.id,
                    serviceProviderId: serviceProvider.id,
                }),
            );

            expect(createResult.id).toBeDefined();
            expect(createResult.createdAt).toBeInstanceOf(Date);
            expect(createResult.updatedAt).toBeInstanceOf(Date);
        });

        it('should persist the created rollenerweiterung', async () => {
            const rollenerweiterung: Rollenerweiterung<false> = createValidRollenerweiterung(
                organisation,
                rolle,
                serviceProvider,
            );

            const createResult: Rollenerweiterung<true> = await sut.create(rollenerweiterung);

            const persistedEntity: RollenerweiterungEntity | null = await em.findOne(RollenerweiterungEntity, {
                id: createResult.id,
            });

            expect(persistedEntity).not.toBeNull();
            expect(persistedEntity).toEqual(
                expect.objectContaining({
                    id: createResult.id,
                }),
            );
            expect(persistedEntity?.organisationId.id).toBe(organisation.id);
            expect(persistedEntity?.rolleId.id).toBe(rolle.id);
            expect(persistedEntity?.serviceProviderId.id).toBe(serviceProvider.id);
        });

        it('should return the existing rollenerweiterung if it already exists', async () => {
            const rollenerweiterung: Rollenerweiterung<false> = createValidRollenerweiterung(
                organisation,
                rolle,
                serviceProvider,
            );

            const firstResult: Rollenerweiterung<true> = await sut.create(rollenerweiterung);

            const secondRollenerweiterung: Rollenerweiterung<false> = createValidRollenerweiterung(
                organisation,
                rolle,
                serviceProvider,
            );

            const secondResult: Rollenerweiterung<true> = await sut.create(secondRollenerweiterung);

            expect(secondResult.id).toBe(firstResult.id);
            expect(secondResult).toEqual(
                expect.objectContaining({
                    organisationId: organisation.id,
                    rolleId: rolle.id,
                    serviceProviderId: serviceProvider.id,
                }),
            );

            const count: number = await em.count(RollenerweiterungEntity, {
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });
            expect(count).toBe(1);
        });

        it('should create different rollenerweiterungen for different service providers', async () => {
            const secondServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });

            const firstRollenerweiterung: Rollenerweiterung<false> = createValidRollenerweiterung(
                organisation,
                rolle,
                serviceProvider,
            );

            const secondRollenerweiterung: Rollenerweiterung<false> = createValidRollenerweiterung(
                organisation,
                rolle,
                secondServiceProvider,
            );

            const firstResult: Rollenerweiterung<true> = await sut.create(firstRollenerweiterung);

            const secondResult: Rollenerweiterung<true> = await sut.create(secondRollenerweiterung);

            expect(secondResult.id).not.toBe(firstResult.id);
            const count: number = await em.count(RollenerweiterungEntity, {
                organisationId: organisation.id,
                rolleId: rolle.id,
            });

            expect(count).toBe(2);
        });

        it('should rethrow UniqueConstraintViolationException if no concurrently created Rollenerweiterung is found', async () => {
            const rollenerweiterung: Rollenerweiterung<false> = DoFactory.createRollenerweiterung<false>(false);

            const uniqueConstraintViolationException: UniqueConstraintViolationException = Object.setPrototypeOf(
                new Error('Unique constraint violation'),
                UniqueConstraintViolationException.prototype,
            ) as UniqueConstraintViolationException;

            const findByComposedIdSpy: Mock = vi
                .spyOn(sut, 'findByComposedId')
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(undefined);

            type RepoWithEntityManager = InternalRollenerweiterungRepo & {
                em: {
                    flush: () => Promise<void>;
                    clear: () => void;
                };
            };

            const repoWithEntityManager: RepoWithEntityManager = sut as RepoWithEntityManager;

            const flushSpy: Mock = vi
                .spyOn(repoWithEntityManager.em, 'flush')
                .mockRejectedValueOnce(uniqueConstraintViolationException);

            try {
                await expect(sut.create(rollenerweiterung)).rejects.toBe(uniqueConstraintViolationException);
                expect(findByComposedIdSpy).toHaveBeenCalledTimes(2);
                expect(flushSpy).toHaveBeenCalledOnce();
            } finally {
                repoWithEntityManager.em.clear();
            }
        });

        it('should return concurrently created Rollenerweiterung after UniqueConstraintViolationException', async () => {
            const rollenerweiterung: Rollenerweiterung<false> = DoFactory.createRollenerweiterung<false>(false);

            const concurrentlyCreatedRollenerweiterung: Rollenerweiterung<true> =
                DoFactory.createRollenerweiterung<true>(true, {
                    organisationId: rollenerweiterung.organisationId,
                    rolleId: rollenerweiterung.rolleId,
                    serviceProviderId: rollenerweiterung.serviceProviderId,
                });

            const uniqueConstraintViolationException: UniqueConstraintViolationException = Object.setPrototypeOf(
                new Error('Unique constraint violation'),
                UniqueConstraintViolationException.prototype,
            ) as UniqueConstraintViolationException;

            const findByComposedIdSpy: Mock = vi
                .spyOn(sut, 'findByComposedId')
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(concurrentlyCreatedRollenerweiterung);

            type RepoWithEntityManager = InternalRollenerweiterungRepo & {
                em: {
                    flush: () => Promise<void>;
                    clear: () => void;
                };
            };

            const repoWithEntityManager: RepoWithEntityManager = sut as RepoWithEntityManager;

            const flushSpy: Mock = vi
                .spyOn(repoWithEntityManager.em, 'flush')
                .mockRejectedValueOnce(uniqueConstraintViolationException);

            try {
                const result: Rollenerweiterung<true> = await sut.create(rollenerweiterung);

                expect(result).toBe(concurrentlyCreatedRollenerweiterung);
                expect(findByComposedIdSpy).toHaveBeenCalledTimes(2);
                expect(findByComposedIdSpy).toHaveBeenNthCalledWith(1, {
                    organisationId: rollenerweiterung.organisationId,
                    rolleId: rollenerweiterung.rolleId,
                    serviceProviderId: rollenerweiterung.serviceProviderId,
                });
                expect(findByComposedIdSpy).toHaveBeenNthCalledWith(2, {
                    organisationId: rollenerweiterung.organisationId,
                    rolleId: rollenerweiterung.rolleId,
                    serviceProviderId: rollenerweiterung.serviceProviderId,
                });
                expect(flushSpy).toHaveBeenCalledOnce();
            } finally {
                repoWithEntityManager.em.clear();
            }
        });

        it('should rethrow persistence errors that are not UniqueConstraintViolationExceptions', async () => {
            const rollenerweiterung: Rollenerweiterung<false> = DoFactory.createRollenerweiterung<false>(false);

            const persistenceError: Error = new Error('Persistence failed');

            const findByComposedIdSpy: Mock = vi.spyOn(sut, 'findByComposedId').mockResolvedValueOnce(undefined);

            type RepoWithEntityManager = InternalRollenerweiterungRepo & {
                em: {
                    flush: () => Promise<void>;
                    clear: () => void;
                };
            };

            const repoWithEntityManager: RepoWithEntityManager = sut as RepoWithEntityManager;

            const flushSpy: Mock = vi.spyOn(repoWithEntityManager.em, 'flush').mockRejectedValueOnce(persistenceError);

            try {
                await expect(sut.create(rollenerweiterung)).rejects.toBe(persistenceError);
                expect(findByComposedIdSpy).toHaveBeenCalledOnce();
                expect(findByComposedIdSpy).toHaveBeenCalledWith({
                    organisationId: rollenerweiterung.organisationId,
                    rolleId: rollenerweiterung.rolleId,
                    serviceProviderId: rollenerweiterung.serviceProviderId,
                });
                expect(flushSpy).toHaveBeenCalledOnce();
            } finally {
                repoWithEntityManager.em.clear();
            }
        });
    });

    describe('existsByOrganisationId', () => {
        it('should return true if the organisation has Rollenerweiterungen', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));

            const rolleOrError: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));

            if (rolleOrError instanceof DomainError) {
                throw rolleOrError;
            }

            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });

            await sut.create(createValidRollenerweiterung(organisation, rolleOrError, serviceProvider));

            const result: boolean = await sut.existsByOrganisationId(organisation.id);

            expect(result).toBe(true);
        });

        it('should return false if the organisation has no Rollenerweiterungen', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));

            const result: boolean = await sut.existsByOrganisationId(organisation.id);

            expect(result).toBe(false);
        });
    });

    describe('findByComposedId', () => {
        let organisation: Organisation<true>;
        let rolle: Rolle<true>;
        let serviceProvider: ServiceProvider<true>;

        beforeEach(async () => {
            organisation = await organisationRepo.save(DoFactory.createOrganisation(false));

            const rolleOrError: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));

            if (rolleOrError instanceof DomainError) {
                throw rolleOrError;
            }
            rolle = rolleOrError;

            serviceProvider = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });
        });

        it('should return the matching rollenerweiterung', async () => {
            const persistedRollenerweiterung: Rollenerweiterung<true> = await sut.create(
                createValidRollenerweiterung(organisation, rolle, serviceProvider),
            );

            const result: Rollenerweiterung<true> | undefined = await sut.findByComposedId({
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });

            expect(result).toEqual(
                expect.objectContaining({
                    id: persistedRollenerweiterung.id,
                    organisationId: organisation.id,
                    rolleId: rolle.id,
                    serviceProviderId: serviceProvider.id,
                }),
            );
        });

        it('should return undefined if no matching rollenerweiterung exists', async () => {
            const result: Rollenerweiterung<true> | undefined = await sut.findByComposedId({
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });

            expect(result).toBeUndefined();
        });

        it('should require the complete composed id to match', async () => {
            await sut.create(createValidRollenerweiterung(organisation, rolle, serviceProvider));

            const results: Array<Rollenerweiterung<true> | undefined> = await Promise.all([
                sut.findByComposedId({
                    organisationId: organisation.id,
                    rolleId: rolle.id,
                    serviceProviderId: faker.string.uuid(),
                }),
                sut.findByComposedId({
                    organisationId: organisation.id,
                    rolleId: faker.string.uuid(),
                    serviceProviderId: serviceProvider.id,
                }),
                sut.findByComposedId({
                    organisationId: faker.string.uuid(),
                    rolleId: rolle.id,
                    serviceProviderId: serviceProvider.id,
                }),
            ]);

            expect(results).toEqual([undefined, undefined, undefined]);
        });
    });

    describe('findByServiceProviderIds', () => {
        let organisations: Array<Organisation<true>>;
        let rollen: Array<Rolle<true>>;
        let serviceProviders: Array<ServiceProvider<true>>;

        beforeEach(async () => {
            const parentOrga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            organisations = await Promise.all(
                [0, 1].map(() =>
                    organisationRepo.save(DoFactory.createOrganisation(false, { administriertVon: parentOrga.id })),
                ),
            );
            rollen = (
                await Promise.all(
                    [0, 1].map(() =>
                        rolleRepo.save(
                            DoFactory.createRolle(false, {
                                administeredBySchulstrukturknoten: parentOrga.id,
                            }),
                        ),
                    ),
                )
            ).filter((rolle: Rolle<true> | DomainError): rolle is Rolle<true> => {
                if (rolle instanceof Rolle) {
                    return true;
                } else {
                    throw rolle;
                }
            });
            serviceProviders = await Promise.all(
                [0, 1, 2].map(() =>
                    createAndPersistServiceProvider(em, {
                        merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                        rollenartenWhitelist: [],
                    }),
                ),
            );

            await Promise.all([
                sut.create(createValidRollenerweiterung(organisations[0]!, rollen[0]!, serviceProviders[0]!)),
                sut.create(createValidRollenerweiterung(organisations[0]!, rollen[1]!, serviceProviders[0]!)),
                sut.create(createValidRollenerweiterung(organisations[1]!, rollen[0]!, serviceProviders[1]!)),
                sut.create(createValidRollenerweiterung(organisations[1]!, rollen[1]!, serviceProviders[2]!)),
            ]);
        });

        it('should return a map with arrays of rollenerweiterungen for each serviceProviderId', async () => {
            const ids: string[] = [serviceProviders[0]!.id, serviceProviders[1]!.id, serviceProviders[2]!.id];
            const result: Map<ServiceProviderID, Rollenerweiterung<true>[]> = await sut.findByServiceProviderIds(ids);

            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(3);

            expect(result.get(serviceProviders[0]!.id)).toBeInstanceOf(Array);
            expect(result.get(serviceProviders[0]!.id)).toHaveLength(2);
            expect(result.get(serviceProviders[1]!.id)).toHaveLength(1);
            expect(result.get(serviceProviders[2]!.id)).toHaveLength(1);

            for (const id of ids) {
                for (const re of result.get(id)!) {
                    expect(re.serviceProviderId).toBe(id);
                }
            }
        });

        it('should return empty arrays for serviceProviderIds with no rollenerweiterungen', async () => {
            const unusedServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });
            const ids: string[] = [unusedServiceProvider.id];
            const result: Map<ServiceProviderID, Rollenerweiterung<true>[]> = await sut.findByServiceProviderIds(ids);

            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(1);
            expect(result.get(unusedServiceProvider.id)).toBeInstanceOf(Array);
            expect(result.get(unusedServiceProvider.id)).toHaveLength(0);
        });

        it('should return an empty map if input array is empty', async () => {
            const result: Map<ServiceProviderID, Rollenerweiterung<true>[]> = await sut.findByServiceProviderIds([]);
            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(0);
        });

        it('should return only rollenerweiterungen for the given organisationIds', async () => {
            const ids: string[] = [serviceProviders[0]!.id, serviceProviders[1]!.id, serviceProviders[2]!.id];

            const result: Map<ServiceProviderID, Rollenerweiterung<true>[]> = await sut.findByServiceProviderIds(ids, [
                organisations[0]!.id,
            ]);

            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(3);

            // organisations[0] has rollenerweiterungen for sp[0] (x2 roles) but none for sp[1] or sp[2]
            expect(result.get(serviceProviders[0]!.id)).toHaveLength(2);
            expect(result.get(serviceProviders[1]!.id)).toHaveLength(0);
            expect(result.get(serviceProviders[2]!.id)).toHaveLength(0);

            for (const re of result.get(serviceProviders[0]!.id)!) {
                expect(re.serviceProviderId).toBe(serviceProviders[0]!.id);
                expect(re.organisationId).toBe(organisations[0]!.id);
            }
        });

        it('should return at most five rollenerweiterungen per service provider', async () => {
            const parentOrga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const testServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });

            const rolleResults: Array<Rolle<true> | DomainError> = await Promise.all(
                makeN(
                    () =>
                        rolleRepo.save(
                            DoFactory.createRolle(false, { administeredBySchulstrukturknoten: parentOrga.id }),
                        ),
                    6,
                ),
            );

            const rollen: Rolle<true>[] = rolleResults.map((value: Rolle<true> | DomainError) => {
                if (value instanceof DomainError) {
                    throw value;
                }
                return value;
            });

            await Promise.all(
                rollen.map((rolle: Rolle<true>) =>
                    sut.create(createValidRollenerweiterung(parentOrga, rolle, testServiceProvider)),
                ),
            );

            const result: Map<ServiceProviderID, Rollenerweiterung<true>[]> = await sut.findByServiceProviderIds([
                testServiceProvider.id,
            ]);

            expect(result.get(testServiceProvider.id)).toHaveLength(5);
        });

        it('should return empty arrays without querying entities if organisationIds is empty', async () => {
            const ids: ServiceProviderID[] = [serviceProviders[0]!.id, serviceProviders[1]!.id];

            const result: Map<ServiceProviderID, Rollenerweiterung<true>[]> = await sut.findByServiceProviderIds(
                ids,
                [],
            );

            expect(result).toEqual(
                new Map([
                    [serviceProviders[0]!.id, []],
                    [serviceProviders[1]!.id, []],
                ]),
            );
        });
    });

    describe('countByServiceProviderIds', () => {
        it('should return count of rollenerweiterungen', async () => {
            const parentOrga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const orgaA: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { administriertVon: parentOrga.id }),
            );
            const orgaB: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { administriertVon: parentOrga.id }),
            );

            const rolleResult: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: parentOrga.id,
                }),
            );

            if (rolleResult instanceof DomainError) {
                throw rolleResult;
            }

            const providerA: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });
            const providerB: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });

            await Promise.all([
                sut.create(createValidRollenerweiterung(orgaA, rolleResult, providerA)),
                sut.create(createValidRollenerweiterung(orgaB, rolleResult, providerA)),
                sut.create(createValidRollenerweiterung(orgaA, rolleResult, providerB)),
            ]);

            const nonExistentProviderId: string = faker.string.uuid();

            const result: Record<string, number> = await sut.countByServiceProviderIds([
                providerA.id,
                providerB.id,
                nonExistentProviderId,
            ]);

            expect(result[providerA.id]).toBe(2);
            expect(result[providerB.id]).toBe(1);
            expect(result[nonExistentProviderId]).toBe(0);
        });

        it('should return count of rollenerweiterungen filtered by organisations', async () => {
            const parentOrga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const orgaA: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { administriertVon: parentOrga.id }),
            );
            const orgaB: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { administriertVon: parentOrga.id }),
            );
            const orgaC: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { administriertVon: parentOrga.id }),
            );

            const rolleResult: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: parentOrga.id,
                }),
            );

            if (rolleResult instanceof DomainError) {
                throw rolleResult;
            }

            const providerA: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });
            const providerB: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });

            await Promise.all([
                sut.create(createValidRollenerweiterung(orgaA, rolleResult, providerA)),
                sut.create(createValidRollenerweiterung(orgaB, rolleResult, providerA)),
                sut.create(createValidRollenerweiterung(orgaA, rolleResult, providerB)),
                sut.create(createValidRollenerweiterung(orgaC, rolleResult, providerA)),
                sut.create(createValidRollenerweiterung(orgaC, rolleResult, providerB)),
            ]);

            const nonExistentProviderId: string = faker.string.uuid();

            const result: Record<string, number> = await sut.countByServiceProviderIds(
                [providerA.id, providerB.id, nonExistentProviderId],
                [orgaA.id],
            );

            expect(result[providerA.id]).toBe(1);
            expect(result[providerB.id]).toBe(1);
            expect(result[nonExistentProviderId]).toBe(0);
        });

        it('should return an empty result if no ServiceProvider IDs are given', async () => {
            const result: Record<ServiceProviderID, number> = await sut.countByServiceProviderIds(
                [],
                [faker.string.uuid()],
            );

            expect(result).toEqual({});
        });
    });

    describe('findManyByOrganisationIdAndServiceProviderId', () => {
        let organisation: Organisation<true>;
        let otherOrganisation: Organisation<true>;
        let rolle: Rolle<true>;
        let serviceProvider: ServiceProvider<true>;
        let otherServiceProvider: ServiceProvider<true>;

        beforeEach(async () => {
            organisation = await organisationRepo.save(DoFactory.createOrganisation(false));
            otherOrganisation = await organisationRepo.save(DoFactory.createOrganisation(false));
            const rolleOrError: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            if (rolleOrError instanceof DomainError) {
                throw new Error('Failed to create Rolle');
            }
            rolle = rolleOrError;
            serviceProvider = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });
            otherServiceProvider = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });
            await sut.create(createValidRollenerweiterung(organisation, rolle, serviceProvider));
            await sut.create(createValidRollenerweiterung(organisation, rolle, otherServiceProvider));
            await sut.create(createValidRollenerweiterung(otherOrganisation, rolle, serviceProvider));
        });

        it('should return all rollenerweiterungen for given organisation and serviceProvider', async () => {
            const result: Rollenerweiterung<true>[] = await sut.findManyByOrganisationIdAndServiceProviderId(
                organisation.id,
                serviceProvider.id,
            );
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(1);
            expect(result[0]!.organisationId).toBe(organisation.id);
            expect(result[0]!.serviceProviderId).toBe(serviceProvider.id);
        });

        it('should return empty array if no rollenerweiterung exists for given organisation and serviceProvider', async () => {
            const result: Rollenerweiterung<true>[] = await sut.findManyByOrganisationIdAndServiceProviderId(
                faker.string.uuid(),
                faker.string.uuid(),
            );
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(0);
        });

        it('should return correct rollenerweiterung if multiple exist for same organisation but different serviceProvider', async () => {
            const result: Rollenerweiterung<true>[] = await sut.findManyByOrganisationIdAndServiceProviderId(
                organisation.id,
                otherServiceProvider.id,
            );
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(1);
            expect(result[0]!.organisationId).toBe(organisation.id);
            expect(result[0]!.serviceProviderId).toBe(otherServiceProvider.id);
        });

        it('should return correct rollenerweiterung if multiple exist for same serviceProvider but different organisation', async () => {
            const result: Rollenerweiterung<true>[] = await sut.findManyByOrganisationIdAndServiceProviderId(
                otherOrganisation.id,
                serviceProvider.id,
            );
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(1);
            expect(result[0]!.organisationId).toBe(otherOrganisation.id);
            expect(result[0]!.serviceProviderId).toBe(serviceProvider.id);
        });
    });

    describe('findManyByRolleId', () => {
        it('should return all rollenerweiterungen for the requested rolle id', async () => {
            const organisationA: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationB: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const targetRolleOrError: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            const otherRolleOrError: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));

            if (targetRolleOrError instanceof DomainError || otherRolleOrError instanceof DomainError) {
                throw new Error('Failed to create test rollen');
            }

            const targetRolle: Rolle<true> = targetRolleOrError;
            const otherRolle: Rolle<true> = otherRolleOrError;

            const serviceProviderA: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });
            const serviceProviderB: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });

            await sut.create(createValidRollenerweiterung(organisationA, targetRolle, serviceProviderA));
            await sut.create(createValidRollenerweiterung(organisationB, targetRolle, serviceProviderB));
            await sut.create(createValidRollenerweiterung(organisationA, otherRolle, serviceProviderA));

            const result: Array<Rollenerweiterung<true>> = await sut.findManyByRolleId(targetRolle.id);

            expect(result).toHaveLength(2);
            expect(result.every((entry: Rollenerweiterung<true>) => entry.rolleId === targetRolle.id)).toBe(true);
        });

        it('should return an empty array when rollenerweiterungen only exist for another rolle', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const existingRolleOrError: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));

            if (existingRolleOrError instanceof DomainError) {
                throw existingRolleOrError;
            }

            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });

            await sut.create(createValidRollenerweiterung(organisation, existingRolleOrError, serviceProvider));

            const result: Array<Rollenerweiterung<true>> = await sut.findManyByRolleId(faker.string.uuid());

            expect(result).toEqual([]);
        });
    });

    describe('findByServiceProviderIdAndRollenarten', () => {
        let organisation: Organisation<true>;
        let lehrRolle: Rolle<true>;
        let lernRolle: Rolle<true>;
        let serviceProvider: ServiceProvider<true>;

        beforeEach(async () => {
            organisation = await organisationRepo.save(DoFactory.createOrganisation(false));

            const lehrRolleOrError: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    rollenart: RollenArt.LEHR,
                }),
            );

            const lernRolleOrError: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    rollenart: RollenArt.LERN,
                }),
            );

            if (lehrRolleOrError instanceof DomainError || lernRolleOrError instanceof DomainError) {
                throw new Error('Failed to create Rollen');
            }

            lehrRolle = lehrRolleOrError;
            lernRolle = lernRolleOrError;

            serviceProvider = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });

            await sut.create(createValidRollenerweiterung(organisation, lehrRolle, serviceProvider));

            await sut.create(createValidRollenerweiterung(organisation, lernRolle, serviceProvider));
        });

        it('should return all Rollenerweiterungen if no Rollenarten are provided', async () => {
            const result: Rollenerweiterung<true>[] = await sut.findByServiceProviderIdAndRollenarten(
                serviceProvider.id,
            );

            expect(result).toHaveLength(2);
        });

        it('should return only Rollenerweiterungen matching the Rollenarten', async () => {
            const result: Rollenerweiterung<true>[] = await sut.findByServiceProviderIdAndRollenarten(
                serviceProvider.id,
                [RollenArt.LEHR],
            );

            expect(result).toHaveLength(1);
            expect(result[0]?.rolleId).toBe(lehrRolle.id);
        });

        it('should return all Rollenerweiterungen if Rollenarten is empty', async () => {
            const result: Rollenerweiterung<true>[] = await sut.findByServiceProviderIdAndRollenarten(
                serviceProvider.id,
                [],
            );

            expect(result).toHaveLength(2);
        });

        it('should not return Rollenerweiterungen for another ServiceProvider', async () => {
            const otherServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });

            await sut.create(createValidRollenerweiterung(organisation, lehrRolle, otherServiceProvider));

            const result: Rollenerweiterung<true>[] = await sut.findByServiceProviderIdAndRollenarten(
                serviceProvider.id,
                [RollenArt.LEHR],
            );

            expect(result).toHaveLength(1);
            expect(
                result.every(
                    (rollenerweiterung: Rollenerweiterung<true>): boolean =>
                        rollenerweiterung.serviceProviderId === serviceProvider.id,
                ),
            ).toBe(true);
        });
    });

    describe('findManyByOrganisationAndRolle', () => {
        let organisations: Array<Organisation<true>>;
        let rollen: Array<Rolle<true>>;
        let serviceProviders: Array<ServiceProvider<true>>;

        beforeEach(async () => {
            const parentOrga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            organisations = await Promise.all(
                makeN(
                    () =>
                        organisationRepo.save(DoFactory.createOrganisation(false, { administriertVon: parentOrga.id })),
                    3,
                ),
            );
            rollen = (
                await Promise.all(
                    makeN(
                        () =>
                            rolleRepo.save(
                                DoFactory.createRolle(false, {
                                    administeredBySchulstrukturknoten: parentOrga.id,
                                }),
                            ),
                        3,
                    ),
                )
            ).filter((rolle: Rolle<true> | DomainError): rolle is Rolle<true> => {
                if (rolle instanceof Rolle) {
                    return true;
                } else {
                    throw rolle;
                }
            });
            serviceProviders = await Promise.all(
                makeN(
                    () =>
                        createAndPersistServiceProvider(em, {
                            merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                            rollenartenWhitelist: [],
                        }),
                    3,
                ),
            );
            const unpersistedRollenerweiterungen: Rollenerweiterung<false>[] = [];
            for (const organisation of organisations) {
                for (const rolle of rollen) {
                    for (const serviceProvider of serviceProviders) {
                        unpersistedRollenerweiterungen.push(
                            createValidRollenerweiterung(organisation, rolle, serviceProvider),
                        );
                    }
                }
            }

            await Promise.all(
                unpersistedRollenerweiterungen.map((rollenerweiterung: Rollenerweiterung<false>) =>
                    sut.create(rollenerweiterung),
                ),
            );
        });

        test('should return empty array for empty query', async () => {
            const query: Array<Pick<Rollenerweiterung<boolean>, 'organisationId' | 'rolleId'>> = [];
            const result: Array<Rollenerweiterung<true>> = await sut.findManyByOrganisationAndRolle(query);
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(0);
        });

        test('should return all rollenerweiterungen for given organisation and rolle', async () => {
            const query: Array<Pick<Rollenerweiterung<boolean>, 'organisationId' | 'rolleId'>> = [
                { organisationId: organisations[0]!.id, rolleId: rollen[0]!.id },
            ];
            const result: Array<Rollenerweiterung<true>> = await sut.findManyByOrganisationAndRolle(query);
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(3);
            for (const erweiterung of result) {
                expect(erweiterung).toEqual(expect.objectContaining(query[0]!));
            }
        });

        test('should return all rollenerweiterungen for multiple given organisations and rollen', async () => {
            type QueryItem = Pick<Rollenerweiterung<boolean>, 'organisationId' | 'rolleId'>;
            const query: Array<QueryItem> = [
                { organisationId: organisations[0]!.id, rolleId: rollen[0]!.id },
                { organisationId: organisations[1]!.id, rolleId: rollen[1]!.id },
                { organisationId: organisations[2]!.id, rolleId: rollen[2]!.id },
            ];
            const result: Array<Rollenerweiterung<true>> = await sut.findManyByOrganisationAndRolle(query);
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(9);
            query.forEach((queryItem: QueryItem) => {
                expect(
                    result.filter(
                        (rollenerweiterung: Rollenerweiterung<true>) =>
                            rollenerweiterung.organisationId === queryItem.organisationId &&
                            rollenerweiterung.rolleId === queryItem.rolleId,
                    ),
                ).toHaveLength(3);
            });
        });
    });

    describe('findManyByOrganisationId', () => {
        let organisations: Array<Organisation<true>>;
        let rollen: Array<Rolle<true>>;
        let serviceProviders: Array<ServiceProvider<true>>;

        beforeEach(async () => {
            const parentOrga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            organisations = await Promise.all(
                makeN(
                    () =>
                        organisationRepo.save(DoFactory.createOrganisation(false, { administriertVon: parentOrga.id })),
                    3,
                ),
            );
            rollen = (
                await Promise.all(
                    makeN(
                        () =>
                            rolleRepo.save(
                                DoFactory.createRolle(false, { administeredBySchulstrukturknoten: parentOrga.id }),
                            ),
                        3,
                    ),
                )
            ).filter((rolle: Rolle<true> | DomainError): rolle is Rolle<true> => {
                if (rolle instanceof Rolle) {
                    return true;
                } else {
                    throw rolle;
                }
            });
            serviceProviders = await Promise.all(
                makeN(
                    () =>
                        createAndPersistServiceProvider(em, {
                            merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                            rollenartenWhitelist: [],
                        }),
                    3,
                ),
            );
            const unpersistedRollenerweiterungen: Rollenerweiterung<false>[] = [];
            for (const organisation of organisations) {
                for (const rolle of rollen) {
                    for (const serviceProvider of serviceProviders) {
                        unpersistedRollenerweiterungen.push(
                            createValidRollenerweiterung(organisation, rolle, serviceProvider),
                        );
                    }
                }
            }

            await Promise.all(
                unpersistedRollenerweiterungen.map((rollenerweiterung: Rollenerweiterung<false>) =>
                    sut.create(rollenerweiterung),
                ),
            );
        });

        test('should return all rollenerweiterungen for given organisation', async () => {
            const organisationId: OrganisationID = organisations[0]!.id;
            const result: Array<Rollenerweiterung<true>> = await sut.findManyByOrganisationId(organisationId);
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(9);
            for (const erweiterung of result) {
                expect(erweiterung).toEqual(expect.objectContaining({ organisationId }));
            }
        });

        test('should return paged result', async () => {
            const limit: number = 1;
            const organisationId: OrganisationID = organisations[0]!.id;
            const firstPage: Array<Rollenerweiterung<true>> = await sut.findManyByOrganisationId(
                organisationId,
                0,
                limit,
            );
            expect(firstPage).toBeInstanceOf(Array);
            expect(firstPage).toHaveLength(limit);

            const secondPage: Array<Rollenerweiterung<true>> = await sut.findManyByOrganisationId(
                organisationId,
                1,
                limit,
            );
            expect(secondPage).toBeInstanceOf(Array);
            expect(secondPage).toHaveLength(limit);
            expect(firstPage).not.toEqual(expect.arrayContaining(secondPage));
        });
    });

    describe('findByServiceProviderIdPagedAndSortedByOrgaKennung', () => {
        let organisation1: Organisation<true>;
        let organisation2: Organisation<true>;
        let organisation3: Organisation<true>;
        let rolle: Rolle<true>;
        let serviceProvider: ServiceProvider<true>;

        beforeEach(async () => {
            organisation1 = await organisationRepo.save(DoFactory.createOrganisation(false, { kennung: 'A' }));
            organisation2 = await organisationRepo.save(DoFactory.createOrganisation(false, { kennung: 'C' }));
            organisation3 = await organisationRepo.save(DoFactory.createOrganisation(false, { kennung: 'B' }));
            const rolleOrError: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            if (rolleOrError instanceof DomainError) {
                throw new Error('Failed to create Rolle');
            }
            rolle = rolleOrError;
            serviceProvider = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });
        });

        it('should return empty array and count 0 if no rollenerweiterung exists for serviceProviderId', async () => {
            const [result, count]: Counted<Rollenerweiterung<true>> =
                await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(serviceProvider.id);
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(0);
            expect(count).toBe(0);
        });

        it('should return all sorted rollenerweiterungen and correct count for serviceProviderId', async () => {
            const erweiterungen: Rollenerweiterung<false>[] = [
                createValidRollenerweiterung(organisation1, rolle, serviceProvider),
                createValidRollenerweiterung(organisation2, rolle, serviceProvider),
                createValidRollenerweiterung(organisation3, rolle, serviceProvider),
            ];
            await Promise.all(erweiterungen.map((re: Rollenerweiterung<false>) => sut.create(re)));

            const [result, count]: Counted<Rollenerweiterung<true>> =
                await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(serviceProvider.id);
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(erweiterungen.length);
            expect(count).toBe(erweiterungen.length);
            for (const erweiterung of result) {
                expect(erweiterung.serviceProviderId).toBe(serviceProvider.id);
            }
            expect(result[0]!.organisationId).toBe(organisation1.id);
            expect(result[1]!.organisationId).toBe(organisation3.id);
            expect(result[2]!.organisationId).toBe(organisation2.id);
        });

        it('should respect limit and offset parameters', async () => {
            const erweiterungen: Rollenerweiterung<false>[] = [
                createValidRollenerweiterung(organisation1, rolle, serviceProvider),
                createValidRollenerweiterung(organisation2, rolle, serviceProvider),
                createValidRollenerweiterung(organisation3, rolle, serviceProvider),
            ];
            await Promise.all(erweiterungen.map((re: Rollenerweiterung<false>) => sut.create(re)));

            const [result, count]: Counted<Rollenerweiterung<true>> =
                await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(
                    serviceProvider.id,
                    undefined,
                    undefined,
                    1,
                    2,
                );
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(2);
            expect(count).toBe(3);
        });

        it('should return only rollenerweiterungen for the given organisationIds', async () => {
            const erweiterungen: Rollenerweiterung<false>[] = [
                createValidRollenerweiterung(organisation1, rolle, serviceProvider),
                createValidRollenerweiterung(organisation2, rolle, serviceProvider),
                createValidRollenerweiterung(organisation3, rolle, serviceProvider),
            ];
            await Promise.all(erweiterungen.map((re: Rollenerweiterung<false>) => sut.create(re)));

            // Only organisation1 and organisation3 should be included
            const orgaIds: string[] = [organisation1.id, organisation3.id];
            const [result, count]: Counted<Rollenerweiterung<true>> =
                await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(serviceProvider.id, orgaIds);

            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(2);
            expect(count).toBe(2);
            expect(
                result
                    .map(
                        (rollenerweiterung: Rollenerweiterung<true>): OrganisationID =>
                            rollenerweiterung.organisationId,
                    )
                    .sort(),
            ).toEqual([...orgaIds].sort());
            for (const erweiterung of result) {
                expect(orgaIds).toContain(erweiterung.organisationId);
                expect(erweiterung.serviceProviderId).toBe(serviceProvider.id);
            }
        });

        it('should return rollenerweiterungen for all organisationIds', async () => {
            const erweiterungen: Rollenerweiterung<false>[] = [
                createValidRollenerweiterung(organisation1, rolle, serviceProvider),
                createValidRollenerweiterung(organisation2, rolle, serviceProvider),
                createValidRollenerweiterung(organisation3, rolle, serviceProvider),
            ];
            await Promise.all(erweiterungen.map((re: Rollenerweiterung<false>) => sut.create(re)));

            const [result, count]: Counted<Rollenerweiterung<true>> =
                await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(serviceProvider.id, undefined);

            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(3);
            expect(count).toBe(3);
        });

        it('should return only rollenerweiterungen for the given rolleIds', async () => {
            const rolleOrError2: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            if (rolleOrError2 instanceof DomainError) {
                throw new Error('Failed to create Rolle');
            }
            const rolle2: Rolle<true> = rolleOrError2;

            const erweiterungen: Rollenerweiterung<false>[] = [
                createValidRollenerweiterung(organisation1, rolle, serviceProvider),
                createValidRollenerweiterung(organisation1, rolle2, serviceProvider),
                createValidRollenerweiterung(organisation2, rolle2, serviceProvider),
            ];
            await Promise.all(erweiterungen.map((re: Rollenerweiterung<false>) => sut.create(re)));

            const [result, count]: Counted<Rollenerweiterung<true>> =
                await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(serviceProvider.id, undefined, [rolle.id]);

            expect(result).toHaveLength(1);
            expect(count).toBe(1);
            for (const erweiterung of result) {
                expect(erweiterung.rolleId).toBe(rolle.id);
            }
        });

        it('should paginate by organisations and return all Rollenerweiterungen of the selected organisation', async () => {
            const secondRolleOrError: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));

            if (secondRolleOrError instanceof DomainError) {
                throw secondRolleOrError;
            }

            const secondRolle: Rolle<true> = secondRolleOrError;

            await Promise.all([
                sut.create(createValidRollenerweiterung(organisation1, rolle, serviceProvider)),
                sut.create(createValidRollenerweiterung(organisation1, secondRolle, serviceProvider)),
                sut.create(createValidRollenerweiterung(organisation2, rolle, serviceProvider)),
            ]);

            const [result, count]: Counted<Rollenerweiterung<true>> =
                await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(
                    serviceProvider.id,
                    undefined,
                    undefined,
                    0,
                    1,
                );

            expect(result).toHaveLength(2);
            expect(
                result.every(
                    (rollenerweiterung: Rollenerweiterung<true>): boolean =>
                        rollenerweiterung.organisationId === organisation1.id,
                ),
            ).toBe(true);
            expect(
                result.map((rollenerweiterung: Rollenerweiterung<true>): string => rollenerweiterung.rolleId),
            ).toEqual(expect.arrayContaining([rolle.id, secondRolle.id]));
            expect(count).toBe(2);
        });

        it('should return an empty result if organisationIds is empty', async () => {
            const result: Counted<Rollenerweiterung<true>> =
                await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(serviceProvider.id, []);

            expect(result).toEqual([[], 0]);
        });
    });

    describe('deleteByComposedId', () => {
        let organisation: Organisation<true>;
        let rolle: Rolle<true>;
        let serviceProvider: ServiceProvider<true>;

        beforeEach(async () => {
            organisation = await organisationRepo.save(DoFactory.createOrganisation(false));
            const rolleOrError: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            if (rolleOrError instanceof DomainError) {
                throw new Error('Failed to create Rolle');
            }
            rolle = rolleOrError;
            serviceProvider = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });
            const re: Rollenerweiterung<false> = createValidRollenerweiterung(organisation, rolle, serviceProvider);
            await sut.create(re);
        });

        it('should delete an existing rollenerweiterung and return Ok(null)', async () => {
            const result: Result<null, DomainError> = await sut.deleteByComposedId({
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });
            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }
            expect(result.value).toBeNull();

            // Ensure it is deleted
            const exists: boolean = await sut.exists({
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });
            expect(exists).toBe(false);
        });

        it('should return Ok(null) if rollenerweiterung does not exist', async () => {
            const result: Result<null, DomainError> = await sut.deleteByComposedId({
                organisationId: faker.string.uuid(),
                rolleId: faker.string.uuid(),
                serviceProviderId: faker.string.uuid(),
            });

            expectOkResult(result);
            expect(result.value).toBeNull();
        });
    });

    describe('deleteByOrganisationIdAndServiceProviderIds', () => {
        let organisation: Organisation<true>;
        let otherOrganisation: Organisation<true>;
        let rolle: Rolle<true>;
        let serviceProviderToDelete: ServiceProvider<true>;
        let secondServiceProviderToDelete: ServiceProvider<true>;
        let serviceProviderToKeep: ServiceProvider<true>;

        beforeEach(async () => {
            organisation = await organisationRepo.save(DoFactory.createOrganisation(false));
            otherOrganisation = await organisationRepo.save(DoFactory.createOrganisation(false));
            const rolleOrError: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            if (rolleOrError instanceof DomainError) {
                throw new Error('Failed to create Rolle');
            }
            rolle = rolleOrError;
            [serviceProviderToDelete, secondServiceProviderToDelete, serviceProviderToKeep] = await Promise.all([
                createAndPersistServiceProvider(em, {
                    merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                    rollenartenWhitelist: [],
                }),
                createAndPersistServiceProvider(em, {
                    merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                    rollenartenWhitelist: [],
                }),
                createAndPersistServiceProvider(em, {
                    merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                    rollenartenWhitelist: [],
                }),
            ]);

            await Promise.all([
                sut.create(createValidRollenerweiterung(organisation, rolle, serviceProviderToDelete)),
                sut.create(createValidRollenerweiterung(organisation, rolle, secondServiceProviderToDelete)),
                sut.create(createValidRollenerweiterung(organisation, rolle, serviceProviderToKeep)),
                sut.create(createValidRollenerweiterung(otherOrganisation, rolle, serviceProviderToDelete)),
            ]);
        });

        it('should return Ok(null) without deleting rollenerweiterungen if serviceProviderIds is empty', async () => {
            const result: Result<null, DomainError> = await sut.deleteByOrganisationIdAndServiceProviderIds(
                organisation.id,
                [],
            );

            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }
            expect(result.value).toBeNull();

            const remaining: Rollenerweiterung<true>[] = await sut.findManyByOrganisationIdAndServiceProviderId(
                organisation.id,
                serviceProviderToDelete.id,
            );
            expect(remaining).toHaveLength(1);
        });

        it('should delete only rollenerweiterungen matching the organisation and serviceProviderIds', async () => {
            const result: Result<null, DomainError> = await sut.deleteByOrganisationIdAndServiceProviderIds(
                organisation.id,
                [serviceProviderToDelete.id, secondServiceProviderToDelete.id],
            );

            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }
            expect(result.value).toBeNull();

            const deletedFirst: Rollenerweiterung<true>[] = await sut.findManyByOrganisationIdAndServiceProviderId(
                organisation.id,
                serviceProviderToDelete.id,
            );
            const deletedSecond: Rollenerweiterung<true>[] = await sut.findManyByOrganisationIdAndServiceProviderId(
                organisation.id,
                secondServiceProviderToDelete.id,
            );
            const keptForOrganisation: Rollenerweiterung<true>[] =
                await sut.findManyByOrganisationIdAndServiceProviderId(organisation.id, serviceProviderToKeep.id);
            const keptForOtherOrganisation: Rollenerweiterung<true>[] =
                await sut.findManyByOrganisationIdAndServiceProviderId(
                    otherOrganisation.id,
                    serviceProviderToDelete.id,
                );

            expect(deletedFirst).toHaveLength(0);
            expect(deletedSecond).toHaveLength(0);
            expect(keptForOrganisation).toHaveLength(1);
            expect(keptForOtherOrganisation).toHaveLength(1);
        });
    });

    describe('deleteByServiceProviderIdAndRollenarten', () => {
        let organisation: Organisation<true>;
        let rolle: Rolle<true>;
        let serviceProvider: ServiceProvider<true>;

        beforeEach(async () => {
            organisation = await organisationRepo.save(DoFactory.createOrganisation(false));
            const rolleOrError: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (rolleOrError instanceof DomainError) {
                throw new Error('Failed to create Rolle');
            }
            rolle = rolleOrError;
            serviceProvider = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });
            const entity: RollenerweiterungEntity = em.create(RollenerweiterungEntity, {
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });
            await em.persist(entity).flush();
        });

        it('should delete rollenerweiterungen for given serviceProviderId', async () => {
            const result: Result<null, DomainError> = await sut.deleteByServiceProviderIdAndRollenarten(
                serviceProvider.id,
            );
            expectOkResult(result);
            const count: number = await em.count(RollenerweiterungEntity, {
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });
            expect(count).toBe(0);
        });

        it('should delete rollenerweiterungen for given serviceProviderId and rollenarten', async () => {
            const result: Result<null, DomainError> = await sut.deleteByServiceProviderIdAndRollenarten(
                serviceProvider.id,
                [rolle.rollenart, RollenArt.SORGBER],
            );
            expectOkResult(result);
            const count: number = await em.count(RollenerweiterungEntity, {
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });
            expect(count).toBe(0);
        });

        it('should not delete rollenerweiterungen if rollenart does not match', async () => {
            const result: Result<null, DomainError> = await sut.deleteByServiceProviderIdAndRollenarten(
                serviceProvider.id,
                [RollenArt.SORGBER],
            );
            expectOkResult(result);
            const count: number = await em.count(RollenerweiterungEntity, {
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });
            expect(count).toBe(1);
        });

        it('should return all Rollenerweiterungen if Rollenarten is empty', async () => {
            const result: Rollenerweiterung<true>[] = await sut.findByServiceProviderIdAndRollenarten(
                serviceProvider.id,
                [],
            );

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(
                expect.objectContaining({
                    organisationId: organisation.id,
                    rolleId: rolle.id,
                    serviceProviderId: serviceProvider.id,
                }),
            );
        });
    });
});
