import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMocked } from '../../../../test/utils/createMock.js';
import {
    ConfigTestModule,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DoFactory,
    expectErrResult,
    expectOkResult,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationEntity } from '../../organisation/persistence/organisation.entity.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { RolleModule } from '../../rolle/rolle.module.js';
import { ServiceProviderInternalRepo } from '../repo/service-provider.internal.repo.js';
import { ServiceProviderRepo } from '../repo/service-provider.repo.js';
import { DuplicateNameError } from '../specification/error/duplicate-name.error.js';
import { AttachedRollenError } from './errors/attached-rollen.error.js';
import { AttachedRollenerweiterungenError } from './errors/attached-rollenerweiterungen.error.js';
import { VidisServiceProviderImmutableError } from './errors/vidis-service-provider-immutable.error.js';
import { ServiceProviderModificationService } from './service-provider-modification.service.js';
import { ServiceProviderKategorie, ServiceProviderMerkmal } from './service-provider.enum.js';
import { ServiceProvider } from './service-provider.js';

describe('ServiceProviderModificationService', () => {
    let module: TestingModule;
    let sut: ServiceProviderModificationService;

    let orm: MikroORM;
    let em: EntityManager;

    let rolleRepo: RolleRepo;
    let rollenerweiterungRepo: RollenerweiterungRepo;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                LoggingTestModule,
                RolleModule,
            ],
            providers: [ServiceProviderModificationService, ServiceProviderRepo, ServiceProviderInternalRepo],
        }).compile();

        sut = module.get(ServiceProviderModificationService);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);
        rolleRepo = module.get(RolleRepo);
        rollenerweiterungRepo = module.get(RollenerweiterungRepo);

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

    describe('create', () => {
        it('should save new service-provider', async () => {
            const serviceProvider: ServiceProvider<false> = DoFactory.createServiceProvider(false, {
                keycloakGroup: faker.string.alphanumeric(),
                keycloakRole: faker.string.alphanumeric(),
            });
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const createResult: Result<ServiceProvider<true>, DomainError> = await sut.create(
                permissionsMock,
                serviceProvider,
            );

            expectOkResult(createResult);
            expect(createResult.value.id).toBeDefined();
        });

        it('should remove ANBIETEN-merkmale when VERFUEGBAR_FUER_ROLLENERWEITERUNG is not set', async () => {
            const serviceProvider: ServiceProvider<false> = DoFactory.createServiceProvider(false, {
                merkmale: [
                    ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG,
                    ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ROLLENVERWALTUNG,
                ],
            });
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const createResult: Result<ServiceProvider<true>, DomainError> = await sut.create(
                permissionsMock,
                serviceProvider,
            );

            expectOkResult(createResult);
            expect(createResult.value.merkmale).toEqual([]);
        });

        it('should return error if name is already used', async () => {
            const name: string = 'Test name';
            const providedOnSchulstrukturknoten: string = faker.string.uuid();

            await createAndPersistServiceProvider(em, { name, providedOnSchulstrukturknoten });
            const serviceProvider: ServiceProvider<false> = DoFactory.createServiceProvider(false, {
                name,
                providedOnSchulstrukturknoten,
            });
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const createResult: Result<ServiceProvider<true>, DomainError> = await sut.create(
                permissionsMock,
                serviceProvider,
            );

            expectErrResult(createResult);
            expect(createResult.error).toBeInstanceOf(DuplicateNameError);
        });

        it('should set some default values if person only has limited permissions', async () => {
            const serviceProvider: ServiceProvider<false> = DoFactory.createServiceProvider(false, {
                merkmale: [],
                requires2fa: true,
                kategorie: ServiceProviderKategorie.VERWALTUNG,
            });
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const createResult: Result<ServiceProvider<true>, DomainError> = await sut.create(
                permissionsMock,
                serviceProvider,
            );

            expectOkResult(createResult);
            expect(createResult.value.id).toBeDefined();

            expect(createResult.value.merkmale).toEqual([
                ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR,
                ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG,
                ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ROLLENVERWALTUNG,
            ]);
            expect(createResult.value.requires2fa).toBe(false);
            expect(createResult.value.kategorie).toBe(ServiceProviderKategorie.SCHULISCH);
        });

        it('return error if person is missing permissions', async () => {
            const serviceProvider: ServiceProvider<false> = DoFactory.createServiceProvider(false);
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const createResult: Result<ServiceProvider<true>, DomainError> = await sut.create(
                permissionsMock,
                serviceProvider,
            );

            expectErrResult(createResult);
            expect(createResult.error).toBeInstanceOf(MissingPermissionsError);
        });
    });

    describe('update', () => {
        it('should not return duplicate name error when trying to update existing', async () => {
            const existingSp: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const updateResult: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissionsMock,
                existingSp,
            );

            expectOkResult(updateResult);
        });

        it('should return error if name is already used', async () => {
            const nameA: string = 'Test name 1';
            const nameB: string = 'Test name 2';
            const providedOnSchulstrukturknoten: string = faker.string.uuid();

            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                name: nameA,
                providedOnSchulstrukturknoten,
            });
            await createAndPersistServiceProvider(em, { name: nameB, providedOnSchulstrukturknoten });

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            serviceProvider.name = nameB;

            const updateResult: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissionsMock,
                serviceProvider,
            );

            expectErrResult(updateResult);
            expect(updateResult.error).toBeInstanceOf(DuplicateNameError);
        });

        it('should return error serviceprovider could not be found', async () => {
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const updateResult: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissionsMock,
                serviceProvider,
            );

            expectErrResult(updateResult);
            expect(updateResult.error).toBeInstanceOf(EntityNotFoundError);
        });

        it('should ignore changes to specific properties if person has limited permissions', async () => {
            const merkmale: ServiceProviderMerkmal[] = [ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR];
            const requires2fa: boolean = true;
            const kategorie: ServiceProviderKategorie = ServiceProviderKategorie.VERWALTUNG;

            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale,
                requires2fa,
                kategorie,
            });

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            serviceProvider.merkmale = [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG];
            serviceProvider.requires2fa = false;
            serviceProvider.kategorie = ServiceProviderKategorie.EMAIL;

            const updateResult: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissionsMock,
                serviceProvider,
            );

            expectOkResult(updateResult);
            expect(updateResult.value.merkmale).toEqual(merkmale);
            expect(updateResult.value.requires2fa).toEqual(requires2fa);
            expect(updateResult.value.kategorie).toEqual(kategorie);
        });

        it('should allow unchanged rollenartenWhitelist and restricted merkmale if person has limited permissions', async () => {
            const merkmale: ServiceProviderMerkmal[] = [
                ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR,
                ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG,
            ];
            const rollenartenWhitelist: RollenArt[] = [RollenArt.LEHR];

            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale,
                rollenartenWhitelist,
            });

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            serviceProvider.name = faker.company.name();

            const updateResult: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissionsMock,
                serviceProvider,
            );

            expectOkResult(updateResult);
            expect(updateResult.value.merkmale).toEqual(merkmale);
            expect(updateResult.value.rollenartenWhitelist).toEqual(rollenartenWhitelist);
        });

        it('should delete rollenerweiterungen if rollenartenWhitelist was changed', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            await em
                .persist(
                    em.create(OrganisationEntity, {
                        ...orga,
                        emailAdress: undefined,
                    }),
                )
                .flush();
            const rollenartenWhitelist: RollenArt[] = [RollenArt.LEHR];
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                rollenartenWhitelist,
            });
            const rolle: Rolle<true> = await rolleRepo.create(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: orga.id,
                    rollenart: rollenartenWhitelist[0],
                }),
            );
            await rollenerweiterungRepo.create(
                DoFactory.createRollenerweiterung(false, {
                    organisationId: orga.id,
                    rolleId: rolle.id,
                    serviceProviderId: serviceProvider.id,
                }),
            );

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            serviceProvider.rollenartenWhitelist = [RollenArt.SYSADMIN];
            const updateResult: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissionsMock,
                serviceProvider,
            );
            expectOkResult(updateResult);
            const erweiterungExists: boolean = await rollenerweiterungRepo.exists({
                organisationId: orga.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });
            expect(erweiterungExists).toBe(false);
        });

        it('should not delete rollenerweiterungen if rollenartenWhitelist is cleared', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            await em
                .persist(
                    em.create(OrganisationEntity, {
                        ...orga,
                        emailAdress: undefined,
                    }),
                )
                .flush();
            const rollenartenWhitelist: RollenArt[] = [RollenArt.LERN, RollenArt.LEHR, RollenArt.LEIT];
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                rollenartenWhitelist,
            });
            const rollen: Rolle<true>[] = await Promise.all(
                rollenartenWhitelist.map(async (rollenart: RollenArt): Promise<Rolle<true>> => {
                    const rolle: Rolle<true> = await rolleRepo.create(
                        DoFactory.createRolle(false, {
                            administeredBySchulstrukturknoten: orga.id,
                            rollenart,
                        }),
                    );
                    await rollenerweiterungRepo.create(
                        DoFactory.createRollenerweiterung(false, {
                            organisationId: orga.id,
                            rolleId: rolle.id,
                            serviceProviderId: serviceProvider.id,
                        }),
                    );
                    return rolle;
                }),
            );

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            serviceProvider.rollenartenWhitelist = [];
            const updateResult: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissionsMock,
                serviceProvider,
            );
            expectOkResult(updateResult);
            const erweiterungExists: boolean[] = await Promise.all(
                rollen.map(async (rolle: Rolle<true>) =>
                    rollenerweiterungRepo.exists({
                        organisationId: orga.id,
                        rolleId: rolle.id,
                        serviceProviderId: serviceProvider.id,
                    }),
                ),
            );
            expect(erweiterungExists).toEqual([true, true, true]);
        });

        it('should remove dependent ANBIETEN-merkmale and delete rollenerweiterungen when VERFUEGBAR_FUER_ROLLENERWEITERUNG is removed', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            await em
                .persist(
                    em.create(OrganisationEntity, {
                        ...orga,
                        emailAdress: undefined,
                    }),
                )
                .flush();
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [
                    ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                    ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG,
                    ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ROLLENVERWALTUNG,
                ],
            });
            const rolle: Rolle<true> = await rolleRepo.create(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: orga.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            await rollenerweiterungRepo.create(
                DoFactory.createRollenerweiterung(false, {
                    organisationId: orga.id,
                    rolleId: rolle.id,
                    serviceProviderId: serviceProvider.id,
                }),
            );

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            serviceProvider.merkmale = [ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG];
            const updateResult: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissionsMock,
                serviceProvider,
            );
            expectOkResult(updateResult);
            expect(updateResult.value.merkmale).toEqual([]);
            const erweiterungExists: boolean = await rollenerweiterungRepo.exists({
                organisationId: orga.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });
            expect(erweiterungExists).toBe(false);
        });

        it('should auto-revert rollenartenWhitelist changes if person has limited permissions', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                rollenartenWhitelist: [RollenArt.LEHR],
            });

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            serviceProvider.rollenartenWhitelist = [RollenArt.LERN];

            const updateResult: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissionsMock,
                serviceProvider,
            );

            expectOkResult(updateResult);
            expect(updateResult.value.rollenartenWhitelist).toEqual([RollenArt.LEHR]);
        });

        it('should return error if rollenartenWhitelist was changed and and rolle with different rollenart and attached provider exists', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            await em
                .persist(
                    em.create(OrganisationEntity, {
                        ...orga,
                        emailAdress: undefined,
                    }),
                )
                .flush();
            const rollenartenWhitelist: RollenArt[] = [RollenArt.LEHR];
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                rollenartenWhitelist,
            });
            await rolleRepo.create(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: orga.id,
                    rollenart: rollenartenWhitelist[0],
                    serviceProviderIds: [serviceProvider.id],
                }),
            );

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            serviceProvider.rollenartenWhitelist = [RollenArt.LERN];

            const updateResult: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissionsMock,
                serviceProvider,
            );

            expectErrResult(updateResult);
            expect(updateResult.error).toBeInstanceOf(AttachedRollenError);
        });

        it('should not return AttachedRollenError when whitelist is emptied and attached rollen are still allowed', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            await em
                .persist(
                    em.create(OrganisationEntity, {
                        ...orga,
                        emailAdress: undefined,
                    }),
                )
                .flush();
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                rollenartenWhitelist: [RollenArt.LEHR],
            });
            await rolleRepo.create(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: orga.id,
                    rollenart: RollenArt.LEHR,
                    serviceProviderIds: [serviceProvider.id],
                }),
            );

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            serviceProvider.rollenartenWhitelist = [];

            const updateResult: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissionsMock,
                serviceProvider,
            );

            expectOkResult(updateResult);
            expect(updateResult.value.rollenartenWhitelist).toEqual([]);
        });

        it('should auto-revert restricted merkmale changes if person has limited permissions', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [
                    ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                    ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR,
                    ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG,
                ],
            });

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            serviceProvider.merkmale = [ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR];

            const updateResult: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissionsMock,
                serviceProvider,
            );

            expectOkResult(updateResult);
            expect(updateResult.value.merkmale).toEqual([
                ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR,
                ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG,
            ]);
        });

        it('return error if person is missing permissions', async () => {
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const createResult: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissionsMock,
                serviceProvider,
            );

            expectErrResult(createResult);
            expect(createResult.error).toBeInstanceOf(MissingPermissionsError);
        });
    });

    describe('deleteByIdAuthorized', () => {
        it('returns AttachedRollenError if attached Rollen exist', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            await em.persist(em.create(OrganisationEntity, { ...orga, emailAdress: undefined })).flush();
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: orga.id,
            });
            await rolleRepo.create(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: orga.id,
                    rollenart: RollenArt.LEHR,
                    serviceProviderIds: [serviceProvider.id],
                }),
            );

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const result: Result<void, DomainError> = await sut.deleteByIdAuthorized(
                permissionsMock,
                serviceProvider.id,
            );

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(AttachedRollenError);
        });

        it('returns AttachedRollenerweiterungenError if attached Rollenerweiterungen exist', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            await em.persist(em.create(OrganisationEntity, { ...orga, emailAdress: undefined })).flush();
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: orga.id,
            });
            const rolle: Rolle<true> = await rolleRepo.create(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: orga.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            await rollenerweiterungRepo.create(
                DoFactory.createRollenerweiterung(false, {
                    organisationId: orga.id,
                    rolleId: rolle.id,
                    serviceProviderId: serviceProvider.id,
                }),
            );

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const result: Result<void, DomainError> = await sut.deleteByIdAuthorized(
                permissionsMock,
                serviceProvider.id,
            );

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(AttachedRollenerweiterungenError);
        });

        it('returns error for VIDIS-linked service providers before deleting', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                vidisAngebotId: faker.string.uuid(),
            });

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const result: Result<void, DomainError> = await sut.deleteByIdAuthorized(
                permissionsMock,
                serviceProvider.id,
            );

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(VidisServiceProviderImmutableError);

            const persisted: Option<ServiceProvider<true>> = await module
                .get(ServiceProviderRepo)
                .findById(serviceProvider.id);
            expect(persisted).not.toBeNull();
        });

        it('deletes service provider and returns Ok() on success', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const result: Result<void, DomainError> = await sut.deleteByIdAuthorized(
                permissionsMock,
                serviceProvider.id,
            );

            expectOkResult(result);
            const persisted: Option<ServiceProvider<true>> = await module
                .get(ServiceProviderRepo)
                .findById(serviceProvider.id);
            expect(persisted).toBeNull();
        });

        it('returns EntityNotFoundError on missing service provider', async () => {
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const result: Result<void, DomainError> = await sut.deleteByIdAuthorized(
                permissionsMock,
                faker.string.uuid(),
            );

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
        });

        it('returns MissingPermissionsError if caller lacks permission for the service provider organisation', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<void, DomainError> = await sut.deleteByIdAuthorized(
                permissionsMock,
                serviceProvider.id,
            );

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(MissingPermissionsError);

            const persisted: Option<ServiceProvider<true>> = await module
                .get(ServiceProviderRepo)
                .findById(serviceProvider.id);
            expect(persisted).not.toBeNull();
        });
    });
});
