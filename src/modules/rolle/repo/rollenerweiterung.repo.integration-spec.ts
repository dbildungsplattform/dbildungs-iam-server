import { EntityManager, MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';

import { faker } from '@faker-js/faker';
import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DatabaseTestModule } from '../../../../test/utils/database-test.module.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { expectErrResult, expectOkResult } from '../../../../test/utils/index.js';
import { LoggingTestModule } from '../../../../test/utils/logging-test.module.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { DEFAULT_TIMEOUT_FOR_TESTCONTAINERS } from '../../../../test/utils/timeouts.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { OrganisationID, ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
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
import { RollenSystemRecht } from '../domain/systemrecht.js';
import { RollenerweiterungEntity } from '../entity/rollenerweiterung.entity.js';
import { NoRedundantRollenerweiterungError } from '../specification/error/no-redundant-rollenerweiterung.error.js';
import { ServiceProviderNichtVerfuegbarFuerRollenerweiterungError } from '../specification/error/service-provider-nicht-verfuegbar-fuer-rollenerweiterung.error.js';
import { RolleRepo } from './rolle.repo.js';
import { RollenerweiterungRepo } from './rollenerweiterung.repo.js';

function makeN<T>(fn: () => T, n: number): Array<T> {
    return Array.from({ length: n }, fn);
}

describe('RollenerweiterungRepo', () => {
    let module: TestingModule;
    let sut: RollenerweiterungRepo;
    let orm: MikroORM;
    let em: EntityManager;
    let factory: RollenerweiterungFactory;
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
                RollenerweiterungRepo,
                RollenerweiterungFactory,
                OrganisationRepository,
                EventRoutingLegacyKafkaService,
            ],
        })
            .overrideProvider(EventRoutingLegacyKafkaService)
            .useValue(createMock(EventRoutingLegacyKafkaService))
            .compile();

        sut = module.get(RollenerweiterungRepo);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);
        factory = module.get(RollenerweiterungFactory);
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

    describe('findByServiceProviderIds', () => {
        let organisations: Array<Organisation<true>>;
        let rollen: Array<Rolle<true>>;
        let serviceProviders: Array<ServiceProvider<true>>;
        let factory: RollenerweiterungFactory;

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
                    }),
                ),
            );
            factory = module.get(RollenerweiterungFactory);

            await Promise.all([
                sut.create(factory.createNew(organisations[0]!.id, rollen[0]!.id, serviceProviders[0]!.id)),
                sut.create(factory.createNew(organisations[0]!.id, rollen[1]!.id, serviceProviders[0]!.id)),
                sut.create(factory.createNew(organisations[1]!.id, rollen[0]!.id, serviceProviders[1]!.id)),
                sut.create(factory.createNew(organisations[1]!.id, rollen[1]!.id, serviceProviders[2]!.id)),
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

        it('should return only rollenerweiterungen for the given organisationId', async () => {
            const ids: string[] = [serviceProviders[0]!.id, serviceProviders[1]!.id, serviceProviders[2]!.id];

            const result: Map<ServiceProviderID, Rollenerweiterung<true>[]> = await sut.findByServiceProviderIds(
                ids,
                organisations[0]!.id,
            );

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
                    sut.create(factory.createNew(parentOrga.id, rolle.id, testServiceProvider.id)),
                ),
            );

            const result: Map<ServiceProviderID, Rollenerweiterung<true>[]> = await sut.findByServiceProviderIds([
                testServiceProvider.id,
            ]);

            expect(result.get(testServiceProvider.id)).toHaveLength(5);
        });
    });

    describe('countByServiceProviderIds', () => {
        it('should return empty result if no ids are given', async () => {
            const result: Record<string, number> = await sut.countByServiceProviderIds([]);

            expect(result).toStrictEqual({});
        });

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
            });
            const providerB: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });

            const factory: RollenerweiterungFactory = module.get(RollenerweiterungFactory);

            await Promise.all([
                sut.create(factory.createNew(orgaA.id, rolleResult.id, providerA.id)),
                sut.create(factory.createNew(orgaB.id, rolleResult.id, providerA.id)),
                sut.create(factory.createNew(orgaA.id, rolleResult.id, providerB.id)),
            ]);

            const nonExistantProviderId: string = faker.string.uuid();

            const result: Record<string, number> = await sut.countByServiceProviderIds([
                providerA.id,
                providerB.id,
                nonExistantProviderId,
            ]);

            expect(result[providerA.id]).toBe(2);
            expect(result[providerB.id]).toBe(1);
            expect(result[nonExistantProviderId]).toBe(0);
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
            });
            const providerB: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });

            const factory: RollenerweiterungFactory = module.get(RollenerweiterungFactory);

            await Promise.all([
                sut.create(factory.createNew(orgaA.id, rolleResult.id, providerA.id)),
                sut.create(factory.createNew(orgaB.id, rolleResult.id, providerA.id)),
                sut.create(factory.createNew(orgaA.id, rolleResult.id, providerB.id)),
                sut.create(factory.createNew(orgaC.id, rolleResult.id, providerA.id)),
                sut.create(factory.createNew(orgaC.id, rolleResult.id, providerB.id)),
            ]);

            const nonExistantProviderId: string = faker.string.uuid();

            const result: Record<string, number> = await sut.countByServiceProviderIds(
                [providerA.id, providerB.id, nonExistantProviderId],
                [orgaA.id],
            );

            expect(result[providerA.id]).toBe(1);
            expect(result[providerB.id]).toBe(1);
            expect(result[nonExistantProviderId]).toBe(0);
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
            });
            otherServiceProvider = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });
            await sut.create(factory.createNew(organisation.id, rolle.id, serviceProvider.id));
            await sut.create(factory.createNew(organisation.id, rolle.id, otherServiceProvider.id));
            await sut.create(factory.createNew(otherOrganisation.id, rolle.id, serviceProvider.id));
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
            });
            const serviceProviderB: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });

            await sut.create(factory.createNew(organisationA.id, targetRolle.id, serviceProviderA.id));
            await sut.create(factory.createNew(organisationB.id, targetRolle.id, serviceProviderB.id));
            await sut.create(factory.createNew(organisationA.id, otherRolle.id, serviceProviderA.id));

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
            });

            await sut.create(factory.createNew(organisation.id, existingRolleOrError.id, serviceProvider.id));

            const result: Array<Rollenerweiterung<true>> = await sut.findManyByRolleId(faker.string.uuid());

            expect(result).toEqual([]);
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
            });
            const re: Rollenerweiterung<false> = factory.createNew(organisation.id, rolle.id, serviceProvider.id);
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

        it('should return EntityNotFoundError if rollenerweiterung does not exist', async () => {
            const result: Result<null, DomainError> = await sut.deleteByComposedId({
                organisationId: faker.string.uuid(),
                rolleId: faker.string.uuid(),
                serviceProviderId: faker.string.uuid(),
            });
            expectErrResult(result);
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
        });
    });

    describe('deleteByOrganisationIdAndServiceProviderIds', () => {
        let organisation: Organisation<true>;
        let otherOrganisation: Organisation<true>;
        let rolle: Rolle<true>;
        let serviceProviderToDelete: ServiceProvider<true>;
        let secondServiceProviderToDelete: ServiceProvider<true>;
        let serviceProviderToKeep: ServiceProvider<true>;
        let permissions: DeepMocked<PersonPermissions>;

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
                }),
                createAndPersistServiceProvider(em, {
                    merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                }),
                createAndPersistServiceProvider(em, {
                    merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                }),
            ]);
            permissions = createPersonPermissionsMock();

            await Promise.all([
                sut.create(factory.createNew(organisation.id, rolle.id, serviceProviderToDelete.id)),
                sut.create(factory.createNew(organisation.id, rolle.id, secondServiceProviderToDelete.id)),
                sut.create(factory.createNew(organisation.id, rolle.id, serviceProviderToKeep.id)),
                sut.create(factory.createNew(otherOrganisation.id, rolle.id, serviceProviderToDelete.id)),
            ]);
        });

        it('should return MissingPermissionsError if permissions are missing', async () => {
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<null, DomainError> = await sut.deleteByOrganisationIdAndServiceProviderIds(
                organisation.id,
                [serviceProviderToDelete.id],
                permissions,
            );

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(MissingPermissionsError);

            const remaining: Rollenerweiterung<true>[] = await sut.findManyByOrganisationIdAndServiceProviderId(
                organisation.id,
                serviceProviderToDelete.id,
            );
            expect(remaining).toHaveLength(1);
        });

        it('should return Ok(null) without deleting rollenerweiterungen if serviceProviderIds is empty', async () => {
            const result: Result<null, DomainError> = await sut.deleteByOrganisationIdAndServiceProviderIds(
                organisation.id,
                [],
                permissions,
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
                permissions,
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
    });

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
            });
        });

        it('should create rollenerweiterung', async () => {
            const rollenerweiterung: Rollenerweiterung<false> = factory.createNew(
                organisation.id,
                rolle.id,
                serviceProvider.id,
            );
            const createResult: Rollenerweiterung<true> = await sut.create(rollenerweiterung);
            expect(createResult).toBeInstanceOf(Rollenerweiterung);
        });
    });

    describe('createAuthorized', () => {
        type TestCase = 'root' | 'schuladmin';

        type Setup = Awaited<ReturnType<typeof setup>>;

        async function setup(verfuegbarFürRollenerweiterung: boolean = true): Promise<{
            organisation: Organisation<true>;
            rolle: Rolle<true>;
            serviceProvider: ServiceProvider<true>;
            permissionMock: DeepMocked<PersonPermissions>;
        }> {
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, {
                    administriertVon: faker.string.uuid(),
                }),
            );
            const rolleOrError: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                }),
            );
            if (rolleOrError instanceof DomainError) {
                throw new Error('Failed to create Rolle');
            }
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: verfuegbarFürRollenerweiterung
                    ? [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG]
                    : [],
            });
            const permissionMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

            return { organisation, rolle: rolleOrError, serviceProvider, permissionMock };
        }

        it.each<TestCase[]>([['root'], ['schuladmin']])(
            'should create a new rollenerweiterung as %s',
            async (adminType: TestCase) => {
                const { organisation, rolle, serviceProvider, permissionMock }: Setup = await setup();

                if (adminType === 'root') {
                    permissionMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });
                }
                if (adminType === 'schuladmin') {
                    permissionMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                        all: false,
                        orgaIds: [organisation.id],
                    });
                }
                const rollenerweiterung: Rollenerweiterung<false> = factory.createNew(
                    organisation.id,
                    rolle.id,
                    serviceProvider.id,
                );

                const savedRollenerweiterung: Result<Rollenerweiterung<true>, DomainError> = await sut.createAuthorized(
                    rollenerweiterung,
                    permissionMock,
                );

                expect(savedRollenerweiterung.ok).toBe(true);
                if (savedRollenerweiterung.ok) {
                    expect(savedRollenerweiterung.value.organisationId).toBe(rollenerweiterung.organisationId);
                    expect(savedRollenerweiterung.value.rolleId).toBe(rollenerweiterung.rolleId);
                    expect(savedRollenerweiterung.value.serviceProviderId).toBe(rollenerweiterung.serviceProviderId);
                }
            },
        );

        it('should return an error if permissions are missing', async () => {
            const { organisation, rolle, serviceProvider, permissionMock }: Setup = await setup();

            permissionMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [] });
            const rollenerweiterung: Rollenerweiterung<false> = factory.createNew(
                organisation.id,
                rolle.id,
                serviceProvider.id,
            );

            const savedRollenerweiterung: Result<Rollenerweiterung<true>, DomainError> = await sut.createAuthorized(
                rollenerweiterung,
                permissionMock,
            );

            expect(savedRollenerweiterung.ok).toBe(false);
            if (!savedRollenerweiterung.ok) {
                expect(savedRollenerweiterung.error).toBeInstanceOf(MissingPermissionsError);
            }
        });

        it('should return an error if references are invalid', async () => {
            const { rolle, serviceProvider, permissionMock }: Setup = await setup();

            permissionMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });
            const rollenerweiterung: Rollenerweiterung<false> = factory.createNew(
                faker.string.uuid(),
                rolle.id,
                serviceProvider.id,
            );

            const createResult: Result<Rollenerweiterung<true>, DomainError> = await sut.createAuthorized(
                rollenerweiterung,
                permissionMock,
            );

            expect(createResult.ok).toBe(false);
            if (!createResult.ok) {
                expect(createResult.error).toBeInstanceOf(EntityNotFoundError);
            }
        });

        it('should return an error if rolle already has access to service provider', async () => {
            const { organisation, rolle, serviceProvider, permissionMock }: Setup = await setup();

            permissionMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });

            rolle.serviceProviderIds.push(serviceProvider.id);
            await rolleRepo.save(rolle);

            const rollenerweiterung: Rollenerweiterung<false> = factory.createNew(
                organisation.id,
                rolle.id,
                serviceProvider.id,
            );

            const createResult: Result<Rollenerweiterung<true>, DomainError> = await sut.createAuthorized(
                rollenerweiterung,
                permissionMock,
            );

            expect(createResult.ok).toBe(false);
            if (!createResult.ok) {
                expect(createResult.error).toBeInstanceOf(NoRedundantRollenerweiterungError);
            }
        });

        it('should return an error if service provider is not available for rollenerweiterung', async () => {
            const { organisation, rolle, serviceProvider, permissionMock }: Setup = await setup(false);
            permissionMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });

            const rollenerweiterung: Rollenerweiterung<false> = factory.createNew(
                organisation.id,
                rolle.id,
                serviceProvider.id,
            );

            const createResult: Result<Rollenerweiterung<true>, DomainError> = await sut.createAuthorized(
                rollenerweiterung,
                permissionMock,
            );

            expect(createResult.ok).toBe(false);
            if (!createResult.ok) {
                expect(createResult.error).toBeInstanceOf(ServiceProviderNichtVerfuegbarFuerRollenerweiterungError);
            }
        });
    });

    describe('findManyByOrganisationAndRolle', () => {
        let organisations: Array<Organisation<true>>;
        let rollen: Array<Rolle<true>>;
        let serviceProviders: Array<ServiceProvider<true>>;
        let permissionMock: DeepMocked<PersonPermissions>;

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
                        }),
                    3,
                ),
            );
            permissionMock = createPersonPermissionsMock();
            permissionMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            const unpersistedRollenerweiterungen: Array<Rollenerweiterung<false>> = [];
            for (const organisation of organisations) {
                for (const rolle of rollen) {
                    for (const serviceProvider of serviceProviders) {
                        unpersistedRollenerweiterungen.push(
                            factory.createNew(organisation.id, rolle.id, serviceProvider.id),
                        );
                    }
                }
            }
            const results: Array<Result<Rollenerweiterung<true>, DomainError>> = await Promise.all(
                unpersistedRollenerweiterungen.map((re: Rollenerweiterung<false>) =>
                    sut.createAuthorized(re, permissionMock),
                ),
            );
            for (const result of results) {
                if (!result.ok) {
                    throw result.error;
                }
            }
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

        test('should return rollenerweiterungen when authorized for the organisation', async () => {
            permissionMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const result: Result<Rollenerweiterung<true>[], MissingPermissionsError> =
                await sut.findManyByOrganisationAndRolleAuthorized(organisations[0]!.id, rollen[0]!.id, permissionMock);

            expectOkResult(result);
            expect(result.value).toHaveLength(3);
            expect(permissionMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                organisations[0]!.id,
                RollenSystemRecht.ROLLEN_ERWEITERN,
            );
        });

        test('should return MissingPermissionsError when not authorized for the organisation', async () => {
            permissionMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<Rollenerweiterung<true>[], MissingPermissionsError> =
                await sut.findManyByOrganisationAndRolleAuthorized(organisations[0]!.id, rollen[0]!.id, permissionMock);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
        });
    });

    describe('findManyByOrganisationId', () => {
        let organisations: Array<Organisation<true>>;
        let rollen: Array<Rolle<true>>;
        let serviceProviders: Array<ServiceProvider<true>>;
        let permissionMock: DeepMocked<PersonPermissions>;

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
                        }),
                    3,
                ),
            );
            permissionMock = createPersonPermissionsMock();
            permissionMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            const unpersistedRollenerweiterungen: Array<Rollenerweiterung<false>> = [];
            for (const organisation of organisations) {
                for (const rolle of rollen) {
                    for (const serviceProvider of serviceProviders) {
                        unpersistedRollenerweiterungen.push(
                            factory.createNew(organisation.id, rolle.id, serviceProvider.id),
                        );
                    }
                }
            }
            const results: Array<Result<Rollenerweiterung<true>, DomainError>> = await Promise.all(
                unpersistedRollenerweiterungen.map((re: Rollenerweiterung<false>) =>
                    sut.createAuthorized(re, permissionMock),
                ),
            );
            for (const result of results) {
                if (!result.ok) {
                    throw result.error;
                }
            }
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
                factory.createNew(organisation1.id, rolle.id, serviceProvider.id),
                factory.createNew(organisation2.id, rolle.id, serviceProvider.id),
                factory.createNew(organisation3.id, rolle.id, serviceProvider.id),
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
                factory.createNew(organisation1.id, rolle.id, serviceProvider.id),
                factory.createNew(organisation2.id, rolle.id, serviceProvider.id),
                factory.createNew(organisation3.id, rolle.id, serviceProvider.id),
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
                factory.createNew(organisation1.id, rolle.id, serviceProvider.id),
                factory.createNew(organisation2.id, rolle.id, serviceProvider.id),
                factory.createNew(organisation3.id, rolle.id, serviceProvider.id),
            ];
            await Promise.all(erweiterungen.map((re: Rollenerweiterung<false>) => sut.create(re)));

            // Only organisation1 and organisation3 should be included
            const orgaIds: string[] = [organisation1.id, organisation3.id];
            const [result, count]: Counted<Rollenerweiterung<true>> =
                await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(serviceProvider.id, orgaIds);

            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(2);
            expect(count).toBe(2);
            expect(result.map((r: Rollenerweiterung<true>) => r.organisationId).sort()).toEqual(orgaIds.sort());
            for (const erweiterung of result) {
                expect(orgaIds).toContain(erweiterung.organisationId);
                expect(erweiterung.serviceProviderId).toBe(serviceProvider.id);
            }
        });

        it('should return rollenerweiterungen for all organisationIds', async () => {
            const erweiterungen: Rollenerweiterung<false>[] = [
                factory.createNew(organisation1.id, rolle.id, serviceProvider.id),
                factory.createNew(organisation2.id, rolle.id, serviceProvider.id),
                factory.createNew(organisation3.id, rolle.id, serviceProvider.id),
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
                factory.createNew(organisation1.id, rolle.id, serviceProvider.id),
                factory.createNew(organisation1.id, rolle2.id, serviceProvider.id),
                factory.createNew(organisation2.id, rolle2.id, serviceProvider.id),
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
    });
});
