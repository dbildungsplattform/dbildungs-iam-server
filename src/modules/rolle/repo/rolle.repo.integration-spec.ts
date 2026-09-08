import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';

import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DatabaseTestModule } from '../../../../test/utils/database-test.module.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { LoggingTestModule } from '../../../../test/utils/logging-test.module.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { expectErrResult, expectOkResult } from '../../../../test/utils/test-types.js';
import { DEFAULT_TIMEOUT_FOR_TESTCONTAINERS } from '../../../../test/utils/timeouts.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { OrganisationID, ServiceProviderID } from '../../../shared/types/index.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { ServiceProviderModule } from '../../service-provider/service-provider.module.js';
import { NameForRolleWithTrailingSpaceError } from '../domain/name-with-trailing-space.error.js';
import { RollenArt, RollenMerkmal } from '../domain/rolle.enums.js';
import { RolleFactory } from '../domain/rolle.factory.js';
import { Rolle } from '../domain/rolle.js';
import { RollenSystemRecht } from '../domain/systemrecht.js';
import { UpdateMerkmaleError } from '../domain/update-merkmale.error.js';
import { RolleUpdateOutdatedError } from '../domain/update-outdated.error.js';
import { RolleNameNotUniqueOnSskError } from '../specification/error/rolle-name-not-unique-on-ssk.error.js';
import { ServiceProviderNichtNachtraeglichZuweisbarError } from '../specification/error/service-provider-nicht-nachtraeglich-zuweisbar.error.js';
import { RolleFindByParameters, RolleRepo } from './rolle.repo.js';

describe('RolleRepo', () => {
    let module: TestingModule;
    let sut: RolleRepo;
    let orm: MikroORM;
    let em: EntityManager;

    let organisationRepo: OrganisationRepository;
    let serviceProviderRepo: ServiceProviderRepo;

    function constructRolle(props?: Partial<Rolle<boolean>>): Rolle<false> {
        return DoFactory.createRolle(false, {
            serviceProviderRepo,
            organisationRepo,
            ...props,
        });
    }

    async function createRolle(props?: Partial<Rolle<boolean>>): Promise<Rolle<true>> {
        const rolle: Rolle<true> | DomainError = await sut.save(DoFactory.createRolle(false, props));
        if (rolle instanceof DomainError) {
            throw Error();
        }

        return rolle;
    }

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigTestModule,
                LoggingTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                ServiceProviderModule,
            ],
            providers: [RolleRepo, RolleFactory, OrganisationRepository, EventRoutingLegacyKafkaService],
        })
            .overrideProvider(EventRoutingLegacyKafkaService)
            .useValue(createMock(EventRoutingLegacyKafkaService))
            .compile();

        sut = module.get(RolleRepo);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);

        organisationRepo = module.get(OrganisationRepository);
        serviceProviderRepo = module.get(ServiceProviderRepo);

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

    describe('save', () => {
        it('should save a new rolle', async () => {
            const rolle: Rolle<false> = DoFactory.createRolle(false);

            const savedRolle: Rolle<true> | DomainError = await sut.save(rolle);
            if (savedRolle instanceof DomainError) {
                throw Error();
            }

            expect(savedRolle.id).toBeDefined();
        });

        it('should update an existing rolle', async () => {
            const existingRolle: Rolle<true> | DomainError = await sut.save(DoFactory.createRolle(false));
            if (existingRolle instanceof DomainError) {
                throw Error();
            }
            existingRolle.name = faker.person.firstName();

            const savedRolle: Rolle<true> | DomainError = await sut.save(existingRolle);
            if (savedRolle instanceof DomainError) {
                throw Error();
            }

            expect(savedRolle.id).toEqual(existingRolle.id);
            expect(savedRolle.name).toEqual(existingRolle.name);
        });

        it('should save with service provider', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR],
            });
            const rolle: Rolle<false> = DoFactory.createRolle(false, { serviceProviderIds: [serviceProvider.id] });

            const savedRolle: Rolle<true> | DomainError = await sut.save(rolle);
            if (savedRolle instanceof DomainError) {
                throw Error();
            }

            expect(savedRolle.id).toBeDefined();
            expect(savedRolle.serviceProviderIds).toContain(serviceProvider.id);
        });

        it('should throw RolleUpdateOutdatedError if the version does not match', async () => {
            const existingRolle: Rolle<true> | DomainError = await sut.save(DoFactory.createRolle(false));
            if (existingRolle instanceof DomainError) {
                throw Error();
            }

            const update: Rolle<false> = DoFactory.createRolle(false);
            update.id = existingRolle.id;
            update.version = 2;

            await expect(sut.save(update)).rejects.toBeInstanceOf(RolleUpdateOutdatedError);
        });
    });

    describe('findByRollenArten', () => {
        it('should return all rollen', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const rollen: (Rolle<true> | DomainError)[] = await Promise.all([
                sut.save(DoFactory.createRolle(false, { serviceProviderIds: [serviceProvider.id] })),
                sut.save(DoFactory.createRolle(false, { serviceProviderIds: [serviceProvider.id] })),
                sut.save(DoFactory.createRolle(false, { serviceProviderIds: [serviceProvider.id] })),
            ]);

            const rollenResult: Rolle<true>[] = await sut.findByRollenArten(false);

            expect(rollenResult).toHaveLength(3);
            expect(rollenResult).toEqual(expect.arrayContaining(rollen));
        });

        it.each([
            {
                istTechnisch: true,
                includeTechnische: false,
                expectedLength: 0,
                description: 'should not return technische rollen if includeTechnische = false',
            },
            {
                istTechnisch: true,
                includeTechnische: true,
                expectedLength: 1,
                description: 'should return technische rollen if includeTechnische = true',
            },
        ])(
            '$description',
            async ({
                istTechnisch,
                includeTechnische,
                expectedLength,
            }: {
                istTechnisch: boolean;
                includeTechnische: boolean;
                expectedLength: number;
                description: string;
            }) => {
                await sut.save(DoFactory.createRolle(false, { istTechnisch }));
                const rolleResult: Option<Rolle<true>[]> = await sut.findByRollenArten(includeTechnische);

                expect(rolleResult).toBeDefined();
                expect(rolleResult).toHaveLength(expectedLength);
            },
        );

        it('should filter rollen by rollenarten', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            await Promise.all([
                sut.save(
                    DoFactory.createRolle(false, {
                        serviceProviderIds: [serviceProvider.id],
                        rollenart: RollenArt.LEIT,
                    }),
                ),
                sut.save(
                    DoFactory.createRolle(false, {
                        serviceProviderIds: [serviceProvider.id],
                        rollenart: RollenArt.LEHR,
                    }),
                ),
                sut.save(
                    DoFactory.createRolle(false, {
                        serviceProviderIds: [serviceProvider.id],
                        rollenart: RollenArt.LERN,
                    }),
                ),
            ]);

            const rollenResult: Rolle<true>[] = await sut.findByRollenArten(false, undefined, undefined, [
                RollenArt.LEIT,
                RollenArt.LEHR,
            ]);
            expect(rollenResult).toHaveLength(2);
            const rollenarten: RollenArt[] = rollenResult.map((r: Rolle<true>) => r.rollenart);
            expect(rollenarten).toContain(RollenArt.LEIT);
            expect(rollenarten).toContain(RollenArt.LEHR);
            expect(rollenarten).not.toContain(RollenArt.LERN);
        });
    });

    describe('findById', () => {
        it('should return the rolle', async () => {
            const rolle: Rolle<true> | DomainError = await sut.save(DoFactory.createRolle(false));
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const rolleResult: Option<Rolle<true>> = await sut.findById(rolle.id);

            expect(rolleResult).toBeDefined();
            expect(rolleResult).toBeInstanceOf(Rolle);
        });

        it('should return undefined if the entity does not exist', async () => {
            const rolle: Option<Rolle<true>> = await sut.findById(faker.string.uuid());

            expect(rolle).toBeNull();
        });

        it('should return undefined if the entity is technisch', async () => {
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, { istTechnisch: true }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const rolleResult: Option<Rolle<true>> = await sut.findById(rolle.id);
            expect(rolleResult).toBeNull();
        });
    });

    describe('findByIdAuthorized', () => {
        it('should return the rolle if authorized on root level', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, { administeredBySchulstrukturknoten: organisationId }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });

            const rolleResult: Result<Rolle<true>> = await sut.findByIdAuthorized(rolle.id, permissions);

            expect(rolleResult.ok).toBeTruthy();
        });

        it('should return the rolle if authorized on organisation', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, { administeredBySchulstrukturknoten: organisationId }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const rolleResult: Result<Rolle<true>> = await sut.findByIdAuthorized(rolle.id, permissions);

            expect(rolleResult.ok).toBeTruthy();
        });

        it('should return error when permissions are insufficient', async () => {
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, { administeredBySchulstrukturknoten: faker.string.uuid() }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [] });

            const rolleResult: Result<Rolle<true>> = await sut.findByIdAuthorized(rolle.id, permissions);

            expect(rolleResult.ok).toBeFalsy();
        });
    });

    describe('findRollenAuthorized', () => {
        it('should return no rollen because there are none', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const [rolleResult, total]: [Option<Rolle<true>[]>, number] = await sut.findRollenAuthorized(
                permissions,
                [],
                false,
                undefined,
                10,
                0,
            );

            expect(rolleResult?.length).toBe(0);
            expect(total).toBe(0);
        });

        it('should return the rollen when authorized on organisation', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            await sut.save(DoFactory.createRolle(false, { administeredBySchulstrukturknoten: organisationId }));

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const [rolleResult, total]: [Option<Rolle<true>[]>, number] = await sut.findRollenAuthorized(
                permissions,
                [],
                false,
                undefined,
                10,
                0,
            );

            expect(rolleResult?.length).toBe(1);
            expect(total).toBe(1);
        });

        it('should return the rollen when authorized on root organisation', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            await sut.save(DoFactory.createRolle(false, { administeredBySchulstrukturknoten: organisationId }));

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });

            const [rolleResult, total]: [Option<Rolle<true>[]>, number] = await sut.findRollenAuthorized(
                permissions,
                [],
                false,
                undefined,
                10,
                0,
            );

            expect(rolleResult?.length).toBe(1);
            expect(total).toBe(1);
        });

        it('should return empty array when permissions are insufficient', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            await sut.save(DoFactory.createRolle(false, { administeredBySchulstrukturknoten: organisationId }));

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [] });

            const [rolleResult, total]: [Option<Rolle<true>[]>, number] = await sut.findRollenAuthorized(
                permissions,
                [],
                false,
                undefined,
                10,
                0,
            );

            expect(rolleResult?.length).toBe(0);
            expect(total).toBe(0);
        });

        it('should filter rollen based on search string and permissions', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            await sut.save(
                DoFactory.createRolle(false, { administeredBySchulstrukturknoten: organisationId, name: 'Test' }),
            );
            await sut.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisationId,
                    name: 'AnotherName',
                }),
            );

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const [rolleResult, total]: [Option<Rolle<true>[]>, number] = await sut.findRollenAuthorized(
                permissions,
                [],
                false,
                'Test',
                10,
                0,
            );

            expect(rolleResult?.length).toBe(1);
            expect(total).toBe(1);
        });

        it('should return all rollen when no search string is provided and permissions are sufficient', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            await sut.save(DoFactory.createRolle(false, { administeredBySchulstrukturknoten: organisationId }));

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const [rolleResult, total]: [Option<Rolle<true>[]>, number] = await sut.findRollenAuthorized(
                permissions,
                [],
                false,
                undefined,
                10,
                0,
            );

            expect(rolleResult?.length).toBe(1);
            expect(total).toBe(1);
        });

        it('should not return technische rollen if includeTechnische = false', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            await sut.save(
                DoFactory.createRolle(false, { administeredBySchulstrukturknoten: organisationId, istTechnisch: true }),
            );

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const [rolleResult, total]: [Option<Rolle<true>[]>, number] = await sut.findRollenAuthorized(
                permissions,
                [],
                false,
                undefined,
                10,
                0,
            );

            expect(rolleResult).toHaveLength(0);
            expect(total).toBe(0);
        });

        it('should return technische rollen if includeTechnische = true', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            await sut.save(
                DoFactory.createRolle(false, { administeredBySchulstrukturknoten: organisationId, istTechnisch: true }),
            );

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const [rolleResult, total]: [Option<Rolle<true>[]>, number] = await sut.findRollenAuthorized(
                permissions,
                [],
                true,
                undefined,
                10,
                0,
            );

            expect(rolleResult).toHaveLength(1);
            expect(total).toBe(1);
        });

        it('should filter rollen by rollenArten', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            const lehrParams: Partial<Rolle<false>> = {
                administeredBySchulstrukturknoten: organisationId,
                rollenart: RollenArt.LEHR,
                istTechnisch: false,
            };
            const rolle1: Rolle<false> = DoFactory.createRolle(false, lehrParams);
            const rolle2: Rolle<false> = DoFactory.createRolle(false, lehrParams);
            const rolle3: Rolle<false> = DoFactory.createRolle(false, {
                ...lehrParams,
                rollenart: RollenArt.LERN,
            });

            await Promise.all([sut.save(rolle1), sut.save(rolle2), sut.save(rolle3)]);

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const [rolleResult, total]: [Option<Rolle<true>[]>, number] = await sut.findRollenAuthorized(
                permissions,
                [],
                false,
                undefined,
                10,
                0,
                undefined,
                undefined,
                undefined,
                [RollenArt.LEHR],
            );

            expect(rolleResult).toHaveLength(2);
            expect(total).toBe(2);
            expect(rolleResult[0]!.rollenart).toBe(RollenArt.LEHR);
            expect(rolleResult[1]!.rollenart).toBe(RollenArt.LEHR);
        });

        it('should filter rollen by merkmale', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            const befristungParams: Partial<Rolle<false>> = {
                administeredBySchulstrukturknoten: organisationId,
                merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT],
                istTechnisch: false,
            };
            const rolle1: Rolle<false> = DoFactory.createRolle(false, befristungParams);
            const rolle2: Rolle<false> = DoFactory.createRolle(false, befristungParams);
            const rolle3: Rolle<false> = DoFactory.createRolle(false, {
                ...befristungParams,
                merkmale: [],
            });

            await Promise.all([sut.save(rolle1), sut.save(rolle2), sut.save(rolle3)]);

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const [rolleResult, total]: [Option<Rolle<true>[]>, number] = await sut.findRollenAuthorized(
                permissions,
                [],
                false,
                undefined,
                10,
                0,
                undefined,
                undefined,
                [RollenMerkmal.BEFRISTUNG_PFLICHT],
            );

            expect(rolleResult).toHaveLength(2);
            expect(total).toBe(2);
            expect(rolleResult[0]!.merkmale).toContain(RollenMerkmal.BEFRISTUNG_PFLICHT);
            expect(rolleResult[1]!.merkmale).toContain(RollenMerkmal.BEFRISTUNG_PFLICHT);
        });

        it('should filter rollen by serviceProviderIds', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            const sp1: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const sp2: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            await Promise.all([
                sut.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: organisationId,
                        serviceProviderIds: [sp1.id],
                    }),
                ),
                sut.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: organisationId,
                        serviceProviderIds: [sp1.id],
                    }),
                ),
                sut.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: organisationId,
                        serviceProviderIds: [sp2.id],
                    }),
                ),
            ]);

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const [rolleResult, total]: [Option<Rolle<true>[]>, number] = await sut.findRollenAuthorized(
                permissions,
                [],
                false,
                undefined,
                10,
                0,
                undefined,
                undefined,
                undefined,
                undefined,
                [sp1.id],
            );

            expect(rolleResult).toHaveLength(2);
            expect(total).toBe(2);
            expect(rolleResult.every((r: Rolle<true>) => r.serviceProviderIds.includes(sp1.id))).toBe(true);
        });
    });

    describe('findByName', () => {
        it('should return the rolle', async () => {
            const rolle: Rolle<true> | DomainError = await sut.save(DoFactory.createRolle(false));
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const rolleResult: Option<Rolle<true>[]> = await sut.findByName(rolle.name, false, 1);

            expect(rolleResult).toBeDefined();
            expect(rolleResult).toHaveLength(1);
        });

        it('should not return technische rollen if includeTechnische = false', async () => {
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, { istTechnisch: true }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const rolleResult: Option<Rolle<true>[]> = await sut.findByName(rolle.name, false, 1);

            expect(rolleResult).toBeDefined();
            expect(rolleResult).toHaveLength(0);
        });

        it('should return technische rollen if includeTechnische = true', async () => {
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, { istTechnisch: true }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const rolleResult: Option<Rolle<true>[]> = await sut.findByName(rolle.name, true, 1);

            expect(rolleResult).toBeDefined();
            expect(rolleResult).toHaveLength(1);
        });

        it('should return undefined if the entity does not exist', async () => {
            const rolleResult: Option<Rolle<true>[]> = await sut.findByName(faker.string.alpha(), false, 1);

            expect(rolleResult).toBeDefined();
            expect(rolleResult).toHaveLength(0);
        });

        it('should filter rollen by rollenarten', async () => {
            await Promise.all([
                sut.save(
                    DoFactory.createRolle(false, {
                        name: 'rollenart1',
                        rollenart: RollenArt.LEIT,
                    }),
                ),
                sut.save(
                    DoFactory.createRolle(false, {
                        name: 'rollenart2',
                        rollenart: RollenArt.LEHR,
                    }),
                ),
                sut.save(
                    DoFactory.createRolle(false, {
                        name: 'rollenart3',
                        rollenart: RollenArt.LERN,
                    }),
                ),
            ]);

            const rolleResult: Option<Rolle<true>[]> = await sut.findByName('rollenart', false, 10, 0, [
                RollenArt.LEIT,
                RollenArt.LEHR,
            ]);
            expect(rolleResult).toBeDefined();
            expect(rolleResult).toHaveLength(2);
            const rollenarten: RollenArt[] = rolleResult.map((r: Rolle<true>) => r.rollenart);
            expect(rollenarten).toContain(RollenArt.LEIT);
            expect(rollenarten).toContain(RollenArt.LEHR);
            expect(rollenarten).not.toContain(RollenArt.LERN);
        });
    });

    describe('findBy', () => {
        it('should return rollen, when orgaIds and rollenArten are provided', async () => {
            const rollen: Rolle<true>[] = await Promise.all(
                DoFactory.createMany(3, false, DoFactory.createRolle<false>, { istTechnisch: false }).map(
                    (rolle: Rolle<false>) =>
                        sut.save(rolle).then((savedRolle: Rolle<true> | DomainError) => {
                            if (savedRolle instanceof DomainError) {
                                throw Error();
                            }
                            return savedRolle;
                        }),
                ),
            );

            const limit: number = 3;

            const scope: RolleFindByParameters = {
                rollenArten: rollen.slice(1).map((r: Rolle<true>) => r.rollenart),
                allowedOrganisationIds: rollen.slice(2).map((r: Rolle<true>) => r.administeredBySchulstrukturknoten),
                limit,
            };
            const [result, count]: Counted<Rolle<true>> = await sut.findBy(scope);
            expect(result).toHaveLength(1);
            expect(result.map((r: Rolle<true>) => r.id)).toEqual(
                expect.arrayContaining(rollen.slice(2).map((r: Rolle<true>) => r.id)),
            );
            expect(count).toEqual(1);
        });

        it('should return rollen by rolleIds even if they do not match other filters', async () => {
            const rolleInScope: Rolle<true> = await createRolle({
                rollenart: RollenArt.LEIT,
                administeredBySchulstrukturknoten: faker.string.uuid(),
            });
            const rolleOutOfFilter: Rolle<true> = await createRolle({
                rollenart: RollenArt.LERN, // nicht in rollenArten-Filter
                administeredBySchulstrukturknoten: faker.string.uuid(), // nicht in allowedOrganisationIds
            });

            const scope: RolleFindByParameters = {
                rollenArten: [RollenArt.LEIT],
                allowedOrganisationIds: [rolleInScope.administeredBySchulstrukturknoten],
                rolleIds: [rolleOutOfFilter.id],
                limit: 10,
            };

            const [result, count]: Counted<Rolle<true>> = await sut.findBy(scope);

            expect(count).toBe(2);
            expect(result.map((r: Rolle<true>) => r.id)).toEqual(
                expect.arrayContaining([rolleInScope.id, rolleOutOfFilter.id]),
            );
        });
    });

    describe('findBySchulstrukturknoten', () => {
        it('should return rolle', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, { administeredBySchulstrukturknoten: organisationId }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }
            const result: Array<Rolle<true>> = await sut.findBySchulstrukturknoten(organisationId);

            expect(result).toHaveLength(1);
            expect(result).toEqual(expect.arrayContaining([rolle]));
        });
    });

    describe('findByServiceProviderIds', () => {
        it('should return empty map if no ids are given', async () => {
            const resultMap: Map<ServiceProviderID, Rolle<true>[]> = await sut.findByServiceProviderIds([]);

            expect(resultMap.size).toBe(0);
        });

        it('should enforce limit for providers', async () => {
            const serviceProviderA: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR],
            });
            const serviceProviderB: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR],
            });

            await createRolle({ name: 'C', serviceProviderIds: [serviceProviderA.id] });
            const rolleB: Rolle<true> = await createRolle({ name: 'B', serviceProviderIds: [serviceProviderA.id] });
            const rolleA: Rolle<true> = await createRolle({
                name: 'A',
                serviceProviderIds: [serviceProviderA.id, serviceProviderB.id],
            });

            const resultMap: Map<ServiceProviderID, Rolle<true>[]> = await sut.findByServiceProviderIds(
                [serviceProviderA.id],
                2,
            );

            expect(resultMap.size).toBe(1);
            expect(resultMap.get(serviceProviderA.id)).toHaveLength(2);
            expect(resultMap.get(serviceProviderA.id)).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: rolleA.name }),
                    expect.objectContaining({ name: rolleB.name }),
                ]),
            );
        });
    });

    describe('exists', () => {
        it('should return true, if the rolle exists', async () => {
            const rolle: Rolle<true> | DomainError = await sut.save(DoFactory.createRolle(false));
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const exists: boolean = await sut.exists(rolle.id);

            expect(exists).toBe(true);
        });

        it('should return false, if the rolle does not exists', async () => {
            const exists: boolean = await sut.exists(faker.string.uuid());

            expect(exists).toBe(false);
        });
    });

    describe('existsForServiceProviderId', () => {
        it('should return true if an attached rolle exists for service provider', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR],
            });
            await createRolle({
                serviceProviderIds: [serviceProvider.id],
                rollenart: RollenArt.LEHR,
            });

            const exists: boolean = await sut.existsForServiceProviderId(serviceProvider.id);

            expect(exists).toBe(true);
        });

        it('should return false if no attached rolle exists for service provider', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR],
            });

            const exists: boolean = await sut.existsForServiceProviderId(serviceProvider.id);

            expect(exists).toBe(false);
        });

        it('should return true when attached rolle matches rollenarten filter', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR],
            });
            await createRolle({
                serviceProviderIds: [serviceProvider.id],
                rollenart: RollenArt.LEHR,
            });

            const exists: boolean = await sut.existsForServiceProviderId(serviceProvider.id, [RollenArt.LEHR]);

            expect(exists).toBe(true);
        });

        it('should return false when attached rolle does not match rollenarten filter', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR],
            });
            await createRolle({
                serviceProviderIds: [serviceProvider.id],
                rollenart: RollenArt.LEHR,
            });

            const exists: boolean = await sut.existsForServiceProviderId(serviceProvider.id, [RollenArt.SYSADMIN]);

            expect(exists).toBe(false);
        });
    });

    describe('createRolleAuthorized', () => {
        it('should return the created rolle', async () => {
            const orga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const rolle: Rolle<false> = constructRolle({
                administeredBySchulstrukturknoten: orga.id,
            });

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const result: Result<Rolle<true>, DomainError> = await sut.createRolleAuthorized(rolle, permissions);

            expectOkResult(result);
            expect(result.value).toBeInstanceOf(Rolle);
        });

        it('should return error if the user is missing permissions', async () => {
            const orga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const rolle: Rolle<false> = constructRolle({
                administeredBySchulstrukturknoten: orga.id,
            });

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<Rolle<true>, DomainError> = await sut.createRolleAuthorized(rolle, permissions);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
        });

        it('should return error if the rolle fails validation', async () => {
            const orga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const rolle: Rolle<false> = constructRolle({
                name: ' Invalid Name ',
                administeredBySchulstrukturknoten: orga.id,
            });

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const result: Result<Rolle<true>, DomainError> = await sut.createRolleAuthorized(rolle, permissions);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(NameForRolleWithTrailingSpaceError);
        });
    });

    describe('updateRolle', () => {
        it('should return the updated rolle', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, { administeredBySchulstrukturknoten: organisationId }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const newName: string = 'updatedrolle';
            const newMermale: RollenMerkmal[] = [RollenMerkmal.KOPERS_PFLICHT];
            const newSystemrechte: RollenSystemRecht[] = [RollenSystemRecht.PERSONEN_SOFORT_LOESCHEN];
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const rolleResult: Result<Rolle<true>, DomainError> = await sut.updateRolleAuthorized(
                rolle.id,
                newName,
                newMermale,
                newSystemrechte,
                [],
                1,
                false,
                permissions,
            );

            expectOkResult(rolleResult);
            expect(rolleResult.value.id).toBe(rolle.id);
            expect(rolleResult.value.name).toBe(newName);
            expect(rolleResult.value.merkmale).toMatchObject(newMermale);
            expect(rolleResult.value.systemrechte).toMatchObject(newSystemrechte);
            expect(rolleResult.value.serviceProviderIds).toMatchObject([]);
        });

        it('should return error when permissions are insufficient', async () => {
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, { administeredBySchulstrukturknoten: faker.string.uuid() }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [] });

            const rolleResult: Result<Rolle<true>, DomainError> = await sut.updateRolleAuthorized(
                rolle.id,
                faker.company.name(),
                [],
                [],
                [],
                1,
                false,
                permissions,
            );

            expectErrResult(rolleResult);
            expect(rolleResult.error).toBeInstanceOf(DomainError);
        });

        it('should return error when service providers does not exist', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, { administeredBySchulstrukturknoten: organisationId }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const rolleResult: Result<Rolle<true>, DomainError> = await sut.updateRolleAuthorized(
                rolle.id,
                faker.company.name(),
                [],
                [],
                [faker.string.uuid()],
                1,
                false,
                permissions,
            );

            expectErrResult(rolleResult);
            expect(rolleResult.error).toBeInstanceOf(DomainError);
        });

        it.each([
            {
                oldMerkmale: [],
                newMerkmale: [faker.helpers.enumValue(RollenMerkmal)],
            },
            {
                oldMerkmale: [faker.helpers.enumValue(RollenMerkmal)],
                newMerkmale: [],
            },
            {
                oldMerkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT],
                newMerkmale: [RollenMerkmal.KOPERS_PFLICHT],
            },
        ])(
            'should return error when organisation has a personenkontext and merkmale change from $old to $new',
            async ({ oldMerkmale, newMerkmale }: { oldMerkmale: RollenMerkmal[]; newMerkmale: RollenMerkmal[] }) => {
                const organisation: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false),
                );
                const organisationId: OrganisationID = organisation.id;
                const rolle: Rolle<true> | DomainError = await sut.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: organisationId,
                        merkmale: oldMerkmale,
                    }),
                );
                if (rolle instanceof DomainError) {
                    throw Error();
                }

                const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

                const rolleResult: Result<Rolle<true>, DomainError> = await sut.updateRolleAuthorized(
                    rolle.id,
                    faker.company.name(),
                    newMerkmale,
                    [],
                    [],
                    1,
                    true,
                    permissions,
                );

                expectErrResult(rolleResult);
                expect(rolleResult.error).toBeInstanceOf(UpdateMerkmaleError);
            },
        );

        it('should succeed when organisation has a personenkontext and merkmale are not changed', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisationId,
                    merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT],
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });
            const newName: string = faker.company.name();

            const rolleResult: Result<Rolle<true>, DomainError> = await sut.updateRolleAuthorized(
                rolle.id,
                newName,
                [RollenMerkmal.BEFRISTUNG_PFLICHT],
                [],
                [],
                1,
                true,
                permissions,
            );

            expectOkResult(rolleResult);
            expect(rolleResult.value.name).toBe(newName);
        });

        it('should return error when organisation has a personenkontext and merkmale needs to be deleted', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisationId,
                    merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT, RollenMerkmal.KOPERS_PFLICHT],
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const rolleResult: Result<Rolle<true>, DomainError> = await sut.updateRolleAuthorized(
                rolle.id,
                faker.company.name(),
                [],
                [],
                [],
                1,
                true,
                permissions,
            );

            expectErrResult(rolleResult);
            expect(rolleResult.error).toBeInstanceOf(UpdateMerkmaleError);
        });

        it('should return error when rolle is technisch', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisationId,
                    istTechnisch: true,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });
            const rolleResult: Result<Rolle<true>, DomainError> = await sut.updateRolleAuthorized(
                rolle.id,
                faker.company.name(),
                [],
                [],
                [],
                1,
                false,
                permissions,
            );

            expectErrResult(rolleResult);
            expect(rolleResult.error).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return error when rolle with same name on same SSK already exists', async () => {
            const fakeRolleName: string = faker.company.name();
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;
            const rolleWithSameName: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, {
                    name: fakeRolleName,
                    administeredBySchulstrukturknoten: organisationId,
                }),
            );
            if (rolleWithSameName instanceof DomainError) {
                throw Error();
            }

            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, {
                    name: faker.company.name(),
                    administeredBySchulstrukturknoten: organisationId,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const newMermale: RollenMerkmal[] = [RollenMerkmal.KOPERS_PFLICHT];
            const newSystemrechte: RollenSystemRecht[] = [RollenSystemRecht.PERSONEN_SOFORT_LOESCHEN];
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const rolleResult: Result<Rolle<true>, DomainError> = await sut.updateRolleAuthorized(
                rolle.id,
                fakeRolleName,
                newMermale,
                newSystemrechte,
                [],
                1,
                false,
                permissions,
            );

            expectErrResult(rolleResult);
            expect(rolleResult.error).toBeInstanceOf(RolleNameNotUniqueOnSskError);
        });

        it('should return error when a service provider has changed and it is not nachtraeglich zuweisbar', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const organisationId: OrganisationID = organisation.id;

            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR],
                providedOnSchulstrukturknoten: organisationId,
            });
            const rolle: Rolle<true> | DomainError = await sut.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisationId,
                    serviceProviderIds: [serviceProvider.id],
                    serviceProviderData: [serviceProvider],
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });

            const newServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [],
                providedOnSchulstrukturknoten: organisationId,
            });

            const rolleResult: Result<Rolle<true>, DomainError> = await sut.updateRolleAuthorized(
                rolle.id,
                rolle.name,
                rolle.merkmale,
                rolle.systemrechte,
                [newServiceProvider.id],
                1,
                true,
                permissions,
            );

            expectErrResult(rolleResult);
            expect(rolleResult.error).toBeInstanceOf(ServiceProviderNichtNachtraeglichZuweisbarError);
        });
    });

    describe('deleteAuthorized', () => {
        describe('when user has permissions', () => {
            let organisationId: OrganisationID;
            let serviceProvider: ServiceProvider<true>;
            let permissions: DeepMocked<PersonPermissions>;
            let rolle: Rolle<true>;

            beforeEach(async () => {
                organisationId = faker.string.uuid();
                serviceProvider = await createAndPersistServiceProvider(em);
                permissions = createPersonPermissionsMock();
                permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisationId] });
                const rolleOrError: Rolle<true> | DomainError = await sut.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: organisationId,
                        merkmale: [faker.helpers.enumValue(RollenMerkmal)],
                        systemrechte: [faker.helpers.arrayElement(RollenSystemRecht.ALL)],
                        serviceProviderIds: [serviceProvider.id],
                    }),
                );
                if (rolleOrError instanceof DomainError) {
                    throw Error();
                }
                rolle = rolleOrError;
            });

            it('it should succeed', async () => {
                const rolleResult: Option<DomainError> = await sut.deleteAuthorized(rolle.id, permissions);
                expect(rolleResult).toBeUndefined();

                await expect(sut.exists(rolle.id)).resolves.toBe(false);
            });

            it('should rethrow unknown db exception', async () => {
                vi.spyOn(em, 'flush').mockRejectedValueOnce(new Error('Unknown DB error'));
                await expect(sut.deleteAuthorized(rolle.id, permissions)).rejects.toThrow('Unknown DB error');
            });
        });

        describe('when user does not have the required permissions', () => {
            it('should fail', async () => {
                const rolle: Rolle<true> | DomainError = await sut.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: faker.string.uuid(),
                    }),
                );
                if (rolle instanceof DomainError) {
                    throw Error();
                }

                const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                    all: false,
                    orgaIds: [faker.string.uuid()],
                });

                const rolleResult: Option<MissingPermissionsError> = await sut.deleteAuthorized(rolle.id, permissions);

                expect(rolleResult).toBeInstanceOf(MissingPermissionsError);
                await expect(sut.exists(rolle.id)).resolves.toBe(true);
            });
        });

        describe('when rolle is technisch', () => {
            it('should fail', async () => {
                const orgaId: OrganisationID = faker.string.uuid();
                const rolle: Rolle<true> | DomainError = await sut.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: orgaId,
                        istTechnisch: true,
                    }),
                );
                if (rolle instanceof DomainError) {
                    throw Error();
                }

                const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                    all: false,
                    orgaIds: [orgaId],
                });

                const rolleResult: Option<DomainError> = await sut.deleteAuthorized(rolle.id, permissions);
                expect(rolleResult).toBeInstanceOf(EntityNotFoundError);

                await expect(sut.exists(rolle.id)).resolves.toBe(true);
            });
        });
    });
});
