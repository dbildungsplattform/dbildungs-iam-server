import { faker } from '@faker-js/faker';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'openid-client';
import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DatabaseTestModule } from '../../../../test/utils/database-test.module.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { DEFAULT_TIMEOUT_FOR_TESTCONTAINERS } from '../../../../test/utils/timeouts.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { EntityNotFoundError, MissingAttributeError } from '../../../shared/error/index.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { RawPagedResponse } from '../../../shared/paging/raw-paged.response.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { StreamableFileFactory } from '../../../shared/util/streamable-file.factory.js';
import { GlobalValidationPipe } from '../../../shared/validation/global-validation.pipe.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { OIDC_CLIENT } from '../../authentication/services/oidc-client.service.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { RollenerweiterungWithExtendedDataResponse } from '../../rolle/api/rollenerweiterung-with-extended-data.response.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { Rollenerweiterung } from '../../rolle/domain/rollenerweiterung.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { InvalidLogoCombinationError } from '../domain/errors/invalid-logo-combination.error.js';
import { ServiceProviderFindService } from '../domain/service-provider-find.service.js';
import { ServiceProviderModificationService } from '../domain/service-provider-modification.service.js';
import {
    ServiceProviderKategorie,
    ServiceProviderSystem,
    ServiceProviderTarget,
} from '../domain/service-provider.enum.js';
import { ServiceProviderFactory } from '../domain/service-provider.factory.js';
import { ServiceProvider } from '../domain/service-provider.js';
import { ServiceProviderService } from '../domain/service-provider.service.js';
import {
    ManageableServiceProviderWithReferencedObjects,
    ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount,
} from '../domain/types.js';
import { RollenSystemRechtEnum } from '../../rolle/domain/systemrecht.js';
import { ServiceProviderRepo } from '../repo/service-provider.repo.js';
import { ServiceProviderApiModule } from '../service-provider-api.module.js';
import { CreateServiceProviderBodyParams } from './create-service-provider-body.params.js';
import { CreateServiceProviderResponse } from './create-service-provider.response.js';
import { FindAngeboteQueryParams } from './find-angebote-query.params.js';
import { ManageableServiceProviderListEntryResponse } from './manageable-service-provider-list-entry.response.js';
import { ManageableServiceProviderSimpleListEntryResponse } from './manageable-service-provider-simple-list-entry.response.js';
import { ManageableServiceProvidersForOrganisationParams } from './manageable-service-providers-for-organisation.params.js';
import { ManageableServiceProvidersParams } from './manageable-service-providers.params.js';
import { ProviderController } from './provider.controller.js';
import { RollenerweiterungByServiceProvidersIdPathParams } from './rollenerweiterung-by-service-provider-id.pathparams.js';
import { RollenerweiterungByServiceProvidersIdQueryParams } from './rollenerweiterung-by-service-provider-id.queryparams.js';
import { ServiceProviderResponse } from './service-provider.response.js';
import { UpdateServiceProviderBodyParams } from './update-service-provider-body.params.js';

describe('Provider Controller Test', () => {
    let app: INestApplication;
    let serviceProviderFindServiceMock: DeepMocked<ServiceProviderFindService>;
    let serviceProviderServiceMock: DeepMocked<ServiceProviderService>;
    let serviceProviderModificationServiceMock: DeepMocked<ServiceProviderModificationService>;
    let serviceProviderRepoMock: DeepMocked<ServiceProviderRepo>;
    let serviceProviderFactoryMock: DeepMocked<ServiceProviderFactory>;
    let providerController: ProviderController;
    let personPermissionsMock: DeepMocked<PersonPermissions>;
    let loggerMock: DeepMocked<ClassLogger>;
    const oidcClientMock: DeepMocked<Client> = {
        grant: vi.fn(),
        userinfo: vi.fn(),
    } as DeepMocked<Client>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ServiceProviderApiModule,
                CommonTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: false }),
            ],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                {
                    provide: OIDC_CLIENT,
                    useValue: oidcClientMock,
                },
            ],
        })
            .overrideProvider(ServiceProviderFindService)
            .useValue(createMock(ServiceProviderFindService))
            .overrideProvider(ServiceProviderService)
            .useValue(createMock(ServiceProviderService))
            .overrideProvider(ServiceProviderModificationService)
            .useValue(createMock(ServiceProviderModificationService))
            .overrideProvider(ServiceProviderRepo)
            .useValue(createMock<ServiceProviderRepo>(ServiceProviderRepo))
            .overrideProvider(ServiceProviderFactory)
            .useValue(createMock<ServiceProviderFactory>(ServiceProviderFactory))
            .overrideProvider(OrganisationRepository)
            .useValue(createMock<OrganisationRepository>(OrganisationRepository))
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .compile();

        serviceProviderFindServiceMock = module.get<DeepMocked<ServiceProviderFindService>>(ServiceProviderFindService);
        serviceProviderServiceMock = module.get<DeepMocked<ServiceProviderService>>(ServiceProviderService);
        serviceProviderModificationServiceMock = module.get<DeepMocked<ServiceProviderModificationService>>(
            ServiceProviderModificationService,
        );
        serviceProviderRepoMock = module.get<DeepMocked<ServiceProviderRepo>>(ServiceProviderRepo);
        serviceProviderFactoryMock = module.get<DeepMocked<ServiceProviderFactory>>(ServiceProviderFactory);
        providerController = module.get(ProviderController);
        loggerMock = module.get<DeepMocked<ClassLogger>>(ClassLogger);
        personPermissionsMock = createPersonPermissionsMock();

        app = module.createNestApplication();
        await app.init();
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await app.close();
    });

    describe('findRollenerweiterungenByServiceProviderId', () => {
        let permissionsMock: DeepMocked<PersonPermissions>;
        let rollenerweiterungRepoMock: DeepMocked<RollenerweiterungRepo>;
        let rolleRepoMock: DeepMocked<RolleRepo>;
        let organisationRepositoryMock: DeepMocked<OrganisationRepository>;
        let providerController: ProviderController;

        beforeEach(() => {
            permissionsMock = createPersonPermissionsMock();
            rollenerweiterungRepoMock = createMock(RollenerweiterungRepo);
            rolleRepoMock = createMock(RolleRepo);
            organisationRepositoryMock = createMock(OrganisationRepository);
            providerController = new ProviderController(
                createMock(StreamableFileFactory),
                createMock(ServiceProviderFactory),
                createMock(ServiceProviderRepo),
                createMock(ServiceProviderFindService),
                createMock(ServiceProviderService),
                rollenerweiterungRepoMock,
                rolleRepoMock,
                organisationRepositoryMock,
                createMock(ServiceProviderModificationService),
                loggerMock,
            );
        });

        it('should throw UnauthorizedException if user has no permitted orgas', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [] });
            const pathParams: RollenerweiterungByServiceProvidersIdPathParams =
                new RollenerweiterungByServiceProvidersIdPathParams();
            Object.assign(pathParams, { angebotId: faker.string.uuid() });
            const bodyParams: ManageableServiceProvidersParams = new ManageableServiceProvidersParams();
            Object.assign(bodyParams, { offset: 0, limit: 10 });

            await expect(
                providerController.findRollenerweiterungenByServiceProviderId(permissionsMock, pathParams, bodyParams),
            ).rejects.toBeInstanceOf(UnauthorizedException);
        });

        it('should return paged response with items and correct total if user is only permitted on some orgas', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: ['FixedOrgaId'] });

            const rollenerweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung(true);
            rollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung.mockResolvedValueOnce([
                [rollenerweiterung],
                1,
            ]);

            const offset: number = faker.number.int({ min: 1, max: 100 });
            const limit: number = faker.number.int({ min: 1, max: 100 });

            organisationRepositoryMock.findByIds.mockResolvedValue(
                new Map([
                    [
                        rollenerweiterung.organisationId,
                        DoFactory.createOrganisation(true, {
                            id: rollenerweiterung.organisationId,
                            name: 'FixedOrgaName',
                            kennung: 'FixedOrgaKennung',
                        }),
                    ],
                ]),
            );
            rolleRepoMock.findByIds.mockResolvedValue(
                new Map([
                    [
                        rollenerweiterung.rolleId,
                        DoFactory.createRolle(true, { id: rollenerweiterung.rolleId, name: 'FixedRolleName' }),
                    ],
                ]),
            );

            const result: RawPagedResponse<RollenerweiterungWithExtendedDataResponse> =
                await providerController.findRollenerweiterungenByServiceProviderId(
                    permissionsMock,
                    { angebotId: faker.string.uuid() },
                    { offset: offset, limit: limit, rolleIds: [rollenerweiterung.rolleId] },
                );

            expect(rollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung).toHaveBeenCalledWith(
                expect.any(String),
                ['FixedOrgaId'],
                [rollenerweiterung.rolleId],
                offset,
                limit,
            );

            expect(result).toBeInstanceOf(RawPagedResponse);
            expect(result.offset).toBe(offset);
            expect(result.limit).toBe(limit);
            expect(result.total).toBe(1);
            expect(result.items).toHaveLength(1);
            expect(result.items[0]).toBeInstanceOf(RollenerweiterungWithExtendedDataResponse);
            expect(result.items[0]?.rolleName).toBe('FixedRolleName');
            expect(result.items[0]?.organisationName).toBe('FixedOrgaName');
            expect(result.items[0]?.organisationKennung).toBe('FixedOrgaKennung');
        });

        it('should return paged response with items and correct total if user is only permitted on some orgas and is filtering for one of his permitted orgas', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: ['FixedOrgaId1', 'FixedOrgaId2'],
            });

            const rollenerweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung(true, {
                organisationId: 'FixedOrgaId2',
            });
            rollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung.mockResolvedValueOnce([
                [rollenerweiterung],
                1,
            ]);

            const offset: number = faker.number.int({ min: 1, max: 100 });
            const limit: number = faker.number.int({ min: 1, max: 100 });

            organisationRepositoryMock.findByIds.mockResolvedValue(
                new Map([
                    [
                        'FixedOrgaId2',
                        DoFactory.createOrganisation(true, {
                            id: 'FixedOrgaId2',
                            name: 'FixedOrgaName2',
                            kennung: 'FixedOrgaKennung2',
                        }),
                    ],
                ]),
            );
            rolleRepoMock.findByIds.mockResolvedValue(
                new Map([
                    [
                        rollenerweiterung.rolleId,
                        DoFactory.createRolle(true, { id: rollenerweiterung.rolleId, name: 'FixedRolleName' }),
                    ],
                ]),
            );

            const result: RawPagedResponse<RollenerweiterungWithExtendedDataResponse> =
                await providerController.findRollenerweiterungenByServiceProviderId(
                    permissionsMock,
                    { angebotId: faker.string.uuid() },
                    {
                        offset: offset,
                        limit: limit,
                        organisationIds: ['FixedOrgaId2'],
                        rolleIds: [rollenerweiterung.rolleId],
                    },
                );

            expect(rollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung).toHaveBeenCalledWith(
                expect.any(String),
                ['FixedOrgaId2'],
                [rollenerweiterung.rolleId],
                offset,
                limit,
            );

            expect(result).toBeInstanceOf(RawPagedResponse);
            expect(result.offset).toBe(offset);
            expect(result.limit).toBe(limit);
            expect(result.total).toBe(1);
            expect(result.items).toHaveLength(1);
            expect(result.items[0]).toBeInstanceOf(RollenerweiterungWithExtendedDataResponse);
            expect(result.items[0]?.rolleName).toBe('FixedRolleName');
            expect(result.items[0]?.organisationName).toBe('FixedOrgaName2');
            expect(result.items[0]?.organisationKennung).toBe('FixedOrgaKennung2');
        });

        it('should throw MissingPermissionsError when user lacks permission when filtering for orga', async () => {
            const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: ['org-2'],
            });
            const pathparams: RollenerweiterungByServiceProvidersIdPathParams = { angebotId: faker.string.uuid() };
            const queryparams: RollenerweiterungByServiceProvidersIdQueryParams =
                new RollenerweiterungByServiceProvidersIdQueryParams();
            Object.assign(queryparams, {
                organisationIds: ['org-1'],
                limit: 10,
                offset: 0,
            });

            await expect(
                providerController.findRollenerweiterungenByServiceProviderId(permissions, pathparams, queryparams),
            ).rejects.toBeInstanceOf(MissingPermissionsError);
        });

        it('should return paged response with items and correct total', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });

            const rollenerweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung(true);
            rollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung.mockResolvedValueOnce([
                [rollenerweiterung],
                1,
            ]);

            const offset: number = faker.number.int({ min: 1, max: 100 });
            const limit: number = faker.number.int({ min: 1, max: 100 });

            organisationRepositoryMock.findByIds.mockResolvedValue(
                new Map([
                    [
                        rollenerweiterung.organisationId,
                        DoFactory.createOrganisation(true, {
                            id: rollenerweiterung.organisationId,
                            name: 'FixedOrgaName',
                            kennung: 'FixedOrgaKennung',
                        }),
                    ],
                ]),
            );
            rolleRepoMock.findByIds.mockResolvedValue(
                new Map([
                    [
                        rollenerweiterung.rolleId,
                        DoFactory.createRolle(true, { id: rollenerweiterung.rolleId, name: 'FixedRolleName' }),
                    ],
                ]),
            );

            const pathParams: RollenerweiterungByServiceProvidersIdPathParams =
                new RollenerweiterungByServiceProvidersIdPathParams();
            Object.assign(pathParams, { angebotId: faker.string.uuid() });
            const bodyParams: ManageableServiceProvidersParams = new ManageableServiceProvidersParams();
            Object.assign(bodyParams, { offset, limit });

            const result: RawPagedResponse<RollenerweiterungWithExtendedDataResponse> =
                await providerController.findRollenerweiterungenByServiceProviderId(
                    permissionsMock,
                    pathParams,
                    bodyParams,
                );

            expect(rollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung).toHaveBeenCalledWith(
                expect.any(String),
                undefined,
                undefined,
                offset,
                limit,
            );

            expect(result).toBeInstanceOf(RawPagedResponse);
            expect(result.offset).toBe(offset);
            expect(result.limit).toBe(limit);
            expect(result.total).toBe(1);
            expect(result.items).toHaveLength(1);
            expect(result.items[0]).toBeInstanceOf(RollenerweiterungWithExtendedDataResponse);
            expect(result.items[0]?.rolleName).toBe('FixedRolleName');
            expect(result.items[0]?.organisationName).toBe('FixedOrgaName');
            expect(result.items[0]?.organisationKennung).toBe('FixedOrgaKennung');
        });

        it('should return fallbacks as empty strings for extended data of related aggregate is mising', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });

            const rollenerweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung(true);
            rollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung.mockResolvedValueOnce([
                [rollenerweiterung],
                1,
            ]);

            organisationRepositoryMock.findByIds.mockResolvedValue(new Map());
            rolleRepoMock.findByIds.mockResolvedValue(new Map());

            const offset: number = faker.number.int({ min: 1, max: 100 });
            const limit: number = faker.number.int({ min: 1, max: 100 });

            const pathParams: RollenerweiterungByServiceProvidersIdPathParams =
                new RollenerweiterungByServiceProvidersIdPathParams();
            Object.assign(pathParams, { angebotId: faker.string.uuid() });
            const bodyParams: ManageableServiceProvidersParams = new ManageableServiceProvidersParams();
            Object.assign(bodyParams, { offset, limit });

            const result: RawPagedResponse<RollenerweiterungWithExtendedDataResponse> =
                await providerController.findRollenerweiterungenByServiceProviderId(
                    permissionsMock,
                    pathParams,
                    bodyParams,
                );

            expect(result).toBeInstanceOf(RawPagedResponse);
            expect(result.offset).toBe(offset);
            expect(result.limit).toBe(limit);
            expect(result.total).toBe(1);
            expect(result.items).toHaveLength(1);
            expect(result.items[0]).toBeInstanceOf(RollenerweiterungWithExtendedDataResponse);
            expect(result.items[0]?.rolleName).toBe('');
            expect(result.items[0]?.organisationName).toBe('');
            expect(result.items[0]?.organisationKennung).toBe('');
        });

        it('should return paged response with default offset and limit if not provided', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });

            const rollenerweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung(true);
            rollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung.mockResolvedValueOnce([
                [rollenerweiterung],
                1,
            ]);

            rolleRepoMock.findByIds.mockResolvedValue(
                new Map([
                    [
                        rollenerweiterung.rolleId,
                        DoFactory.createRolle(true, { id: rollenerweiterung.rolleId, name: faker.person.firstName() }),
                    ],
                ]),
            );

            organisationRepositoryMock.findByIds.mockResolvedValue(
                new Map([
                    [
                        rollenerweiterung.organisationId,
                        DoFactory.createOrganisation(true, {
                            id: rollenerweiterung.organisationId,
                            name: faker.company.name(),
                            kennung: faker.string.alphanumeric(10),
                        }),
                    ],
                ]),
            );

            const pathParams: RollenerweiterungByServiceProvidersIdPathParams =
                new RollenerweiterungByServiceProvidersIdPathParams();
            Object.assign(pathParams, { angebotId: faker.string.uuid() });
            const bodyParams: ManageableServiceProvidersParams = new ManageableServiceProvidersParams();

            const result: RawPagedResponse<RollenerweiterungWithExtendedDataResponse> =
                await providerController.findRollenerweiterungenByServiceProviderId(
                    permissionsMock,
                    pathParams,
                    bodyParams,
                );

            expect(result.offset).toBe(0);
            expect(result.limit).toBe(1);
            expect(result.total).toBe(1);
            expect(result.items).toHaveLength(1);
        });

        it('should return empty items if repo returns empty array', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });
            rollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung.mockResolvedValueOnce([[], 0]);

            const result: RawPagedResponse<RollenerweiterungWithExtendedDataResponse> =
                await providerController.findRollenerweiterungenByServiceProviderId(
                    permissionsMock,
                    { angebotId: faker.string.uuid() },
                    { offset: 0, limit: 10 },
                );

            expect(result.items).toHaveLength(0);
            expect(result.total).toBe(0);
        });
    });

    describe('getAssignableServiceProvidersForRolle', () => {
        beforeEach(() => {
            serviceProviderFindServiceMock.findServiceProvidersForRolleBySchulstrukturknotenAuthorized.mockReset();
        });

        describe('when service providers were found', () => {
            it('should return assignable service providers', async () => {
                const orga: Organisation<true> = DoFactory.createOrganisation(true);
                const spId: string = faker.string.uuid();
                const sp: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    id: spId,
                });
                serviceProviderFindServiceMock.findServiceProvidersForRolleBySchulstrukturknotenAuthorized.mockResolvedValueOnce(
                    Ok([sp]),
                );

                const spResponse: ServiceProviderResponse[] =
                    await providerController.getAssignableServiceProvidersForRolle(personPermissionsMock, {
                        schulstrukturknotenOfRolle: orga.id,
                    });
                expect(spResponse).toBeDefined();
                expect(spResponse).toBeInstanceOf(Array);
                expect(spResponse).toHaveLength(1);
                expect(
                    serviceProviderFindServiceMock.findServiceProvidersForRolleBySchulstrukturknotenAuthorized,
                ).toHaveBeenCalledWith(personPermissionsMock, orga.id);
            });
        });

        describe('when no service providers were found', () => {
            it('should return empty list as response', async () => {
                const orgaId: string = faker.string.uuid();
                serviceProviderFindServiceMock.findServiceProvidersForRolleBySchulstrukturknotenAuthorized.mockResolvedValueOnce(
                    Ok([]),
                );

                const spResponse: ServiceProviderResponse[] =
                    await providerController.getAssignableServiceProvidersForRolle(personPermissionsMock, {
                        schulstrukturknotenOfRolle: orgaId,
                    });
                expect(spResponse).toBeDefined();
                expect(spResponse).toBeInstanceOf(Array);
                expect(spResponse).toHaveLength(0);
            });
        });

        describe('when permissions are missing', () => {
            it('should throw missing permissions error', async () => {
                serviceProviderFindServiceMock.findServiceProvidersForRolleBySchulstrukturknotenAuthorized.mockResolvedValueOnce(
                    Err(new MissingPermissionsError('Rollen Verwalten Systemrecht Required For This Endpoint')),
                );

                await expect(
                    providerController.getAssignableServiceProvidersForRolle(personPermissionsMock, {
                        schulstrukturknotenOfRolle: faker.string.uuid(),
                    }),
                ).rejects.toBeInstanceOf(MissingPermissionsError);
            });
        });
    });

    describe('getMyServiceProviders', () => {
        let pk: Personenkontext<true>;
        let rolleId: string;
        let spId: string;
        let sp: ServiceProvider<true>;
        let personPermissions: DeepMocked<PersonPermissions>;

        beforeEach(() => {
            rolleId = faker.string.uuid();
            spId = faker.string.uuid();
            sp = DoFactory.createServiceProvider(true, { id: spId });
            pk = DoFactory.createPersonenkontext(true, { rolleId });
            personPermissions = createMock(PersonPermissions);
            personPermissions.getPersonenkontextIds.mockResolvedValueOnce([
                { organisationId: pk.organisationId, rolleId: pk.rolleId },
            ]);
        });

        describe.each([
            ['found', true],
            ['not found', false],
        ])('when service providers were %s', (_label: string, hasFoundServiceProviders: boolean) => {
            beforeEach(() => {
                serviceProviderServiceMock.getServiceProvidersByOrganisationenAndRollen.mockResolvedValueOnce(
                    hasFoundServiceProviders ? [sp] : [],
                );
            });
            it('should return list of responses', async () => {
                const spResponse: ServiceProviderResponse[] =
                    await providerController.getMyServiceProviders(personPermissions);
                expect(spResponse).toBeDefined();
                expect(spResponse).toBeInstanceOf(Array);
                if (hasFoundServiceProviders) {
                    expect(spResponse).toHaveLength(1);
                } else {
                    expect(spResponse).toHaveLength(0);
                }
                expect(serviceProviderServiceMock.getServiceProvidersByOrganisationenAndRollen).toHaveBeenCalledWith([
                    { organisationId: pk.organisationId, rolleId: pk.rolleId },
                ]);
            });
        });
    });

    describe('getAvailableServiceProviders', () => {
        describe('when organisationId and systemrecht match', () => {
            beforeEach(() => {
                vi.clearAllMocks();
            });

            it('should call the special rollenerweiterung provider lookup', async () => {
                const organisationId: string = faker.string.uuid();
                const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);
                const queryParams: FindAngeboteQueryParams = new FindAngeboteQueryParams();
                Object.assign(queryParams, {
                    organisationId,
                    systemrechte: [RollenSystemRechtEnum.ROLLEN_ERWEITERN],
                    offset: 3,
                    limit: 25,
                });

                serviceProviderServiceMock.findAllowedProvidersForRollenerweiterungAtOrga.mockResolvedValueOnce([
                    [serviceProvider],
                    1,
                ]);

                const result: RawPagedResponse<ServiceProviderResponse> =
                    await providerController.getAvailableServiceProviders(queryParams, personPermissionsMock);

                expect(serviceProviderServiceMock.findAllowedProvidersForRollenerweiterungAtOrga).toHaveBeenCalledWith(
                    organisationId,
                    personPermissionsMock,
                );
                expect(result).toBeInstanceOf(RawPagedResponse);
                expect(result.total).toBe(1);
                expect(result.offset).toBe(3);
                expect(result.limit).toBe(25);
                expect(result.items).toHaveLength(1);
                expect(result.items[0]).toBeInstanceOf(ServiceProviderResponse);
                expect(result.items[0]?.id).toBe(serviceProvider.id);
            });
        });

        describe('when organisationId is missing', () => {
            beforeEach(() => {
                vi.clearAllMocks();
            });

            it('should not use the organisation-scoped rollenerweiterung lookup', async () => {
                const queryParams: FindAngeboteQueryParams = new FindAngeboteQueryParams();
                Object.assign(queryParams, {
                    systemrechte: [RollenSystemRechtEnum.ROLLEN_ERWEITERN],
                    offset: 4,
                    limit: 12,
                });

                const result: RawPagedResponse<ServiceProviderResponse> =
                    await providerController.getAvailableServiceProviders(queryParams, personPermissionsMock);

                expect(
                    serviceProviderServiceMock.findAllowedProvidersForRollenerweiterungAtOrga,
                ).not.toHaveBeenCalled();
                expect(result).toBeInstanceOf(RawPagedResponse);
                expect(result.total).toBe(0);
                expect(result.offset).toBe(4);
                expect(result.limit).toBe(12);
                expect(result.items).toHaveLength(0);
            });
        });

        describe('when systemrechte are missing', () => {
            beforeEach(() => {
                vi.clearAllMocks();
            });

            it('should not use the organisation-scoped rollenerweiterung lookup and should apply default paging', async () => {
                const queryParams: FindAngeboteQueryParams = new FindAngeboteQueryParams();

                const result: RawPagedResponse<ServiceProviderResponse> =
                    await providerController.getAvailableServiceProviders(queryParams, personPermissionsMock);

                expect(
                    serviceProviderServiceMock.findAllowedProvidersForRollenerweiterungAtOrga,
                ).not.toHaveBeenCalled();
                expect(result).toBeInstanceOf(RawPagedResponse);
                expect(result.total).toBe(0);
                expect(result.offset).toBe(0);
                expect(result.limit).toBe(0);
                expect(result.items).toHaveLength(0);
            });
        });
    });

    describe('getManageableServiceProviders', () => {
        function createManageableObjects(
            serviceProviders: ServiceProvider<true>[],
        ): ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount[] {
            return serviceProviders.map((serviceProvider: ServiceProvider<true>) => ({
                serviceProvider: serviceProvider,
                organisation: DoFactory.createOrganisation(true),
                rollen: [DoFactory.createRolle(true)],
                hasRollenerweiterungen: true,
                enrichedRollenerweiterungen: [
                    {
                        serviceProviderId: serviceProvider.id,
                        organisation: DoFactory.createOrganisation(true),
                        rolle: DoFactory.createRolle(true),
                    },
                ],
                hasSomeVerwaltenPermission: true,
            }));
        }

        it.each([
            { limit: 2, offset: 1 },
            { limit: undefined, offset: undefined },
        ])(
            'should return paged manageable service providers with correct offset and limit for %s',
            async (pagingParams: Pick<ManageableServiceProvidersParams, 'limit' | 'offset'>) => {
                const total: number = 10;
                const serviceProviders: Array<ServiceProvider<true>> = [
                    DoFactory.createServiceProvider(true, { kategorie: ServiceProviderKategorie.EMAIL }),
                    DoFactory.createServiceProvider(true, { kategorie: ServiceProviderKategorie.UNTERRICHT }),
                ];
                const manageableObjects: ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount[] =
                    createManageableObjects(serviceProviders);

                serviceProviderServiceMock.findAuthorized.mockResolvedValue([manageableObjects, total]);

                const params: ManageableServiceProvidersParams = { kategorien: [], ...pagingParams };
                const result: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                    await providerController.getManageableServiceProviders(personPermissionsMock, params);

                expect(serviceProviderServiceMock.findAuthorized).toHaveBeenCalledWith(personPermissionsMock, {
                    kategorien: [],
                    limit: pagingParams.limit,
                    offset: pagingParams.offset,
                });

                expect(result).toBeDefined();
                expect(result.offset).toBe(pagingParams.offset ?? 0);
                expect(result.limit).toBe(pagingParams.limit ?? total);
                expect(result.items).toHaveLength(2);
                expect(result.items[0]).toBeInstanceOf(ManageableServiceProviderSimpleListEntryResponse);
                expect(
                    result.items.map(
                        (item: ManageableServiceProviderSimpleListEntryResponse) => item.rollenartenWhitelist,
                    ),
                ).toEqual(
                    serviceProviders.map(
                        (serviceProvider: ServiceProvider<true>) => serviceProvider.rollenartenWhitelist,
                    ),
                );
            },
        );

        it.each([[ServiceProviderKategorie.EMAIL], [ServiceProviderKategorie.UNTERRICHT]])(
            'should forward the kategorie filter and only return matching service providers for %s',
            async (kategorie: ServiceProviderKategorie) => {
                const matchingServiceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    kategorie,
                });
                const manageableObjects: ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount[] =
                    createManageableObjects([matchingServiceProvider]);

                serviceProviderServiceMock.findAuthorized.mockResolvedValue([manageableObjects, 1]);

                const params: ManageableServiceProvidersParams = { kategorien: [kategorie], limit: 10, offset: 0 };
                const result: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                    await providerController.getManageableServiceProviders(personPermissionsMock, params);

                expect(serviceProviderServiceMock.findAuthorized).toHaveBeenCalledWith(personPermissionsMock, {
                    kategorien: [kategorie],
                    searchFilter: undefined,
                    limit: 10,
                    offset: 0,
                });
                expect(result.items).toHaveLength(1);
                expect(result.items[0]?.kategorie).toBe(kategorie);
                expect(result.items[0]?.id).toBe(matchingServiceProvider.id);
            },
        );
    });

    describe('getManageableServiceProvidersForOrganisationId', () => {
        it('should throw MissingPermissionsError when user lacks permission', async () => {
            const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
            const params: DeepMocked<ManageableServiceProvidersForOrganisationParams> = {
                organisationId: 'org-1',
                limit: 10,
                offset: 0,
            };

            serviceProviderServiceMock.getAuthorizedForRollenErweiternWithMerkmalRollenerweiterung.mockResolvedValueOnce(
                {
                    ok: false,
                    error: new MissingPermissionsError('Rollen Erweitern Systemrecht Required For This Endpoint'),
                },
            );

            await expect(
                providerController.getManageableServiceProvidersForOrganisationId(permissions, params),
            ).rejects.toBeInstanceOf(MissingPermissionsError);
        });

        it('should handle rollenerweiterungenWithName', async () => {
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const params: ManageableServiceProvidersForOrganisationParams = {
                limit: 10,
                offset: 0,
                organisationId: organisation.id,
            };
            const total: number = 1;

            const manageableObjects: ManageableServiceProviderWithReferencedObjects[] = [
                {
                    serviceProvider: serviceProvider,
                    organisation,
                    rollen: [rolle],
                    rollenerweiterungen: [DoFactory.createRollenerweiterung(true)],
                    rollenerweiterungenWithName: [
                        {
                            serviceProviderId: serviceProvider.id,
                            organisation,
                            rolle,
                        },
                    ],
                    hasSomeVerwaltenPermission: true,
                },
            ];

            serviceProviderServiceMock.getAuthorizedForRollenErweiternWithMerkmalRollenerweiterung.mockResolvedValue(
                Ok([manageableObjects, total]),
            );

            const result: RawPagedResponse<ManageableServiceProviderListEntryResponse> =
                await providerController.getManageableServiceProvidersForOrganisationId(personPermissionsMock, params);

            expect(result).toBeDefined();
            expect(result.items).toHaveLength(1);
            expect(result.items[0]).toBeInstanceOf(ManageableServiceProviderListEntryResponse);
            expect(result.items[0]?.rollenerweiterungen).toEqual([
                {
                    organisation: {
                        id: organisation.id,
                        kennung: organisation.kennung,
                        name: organisation.name,
                    },
                    rolle: {
                        id: rolle.id,
                        name: rolle.name,
                    },
                },
            ]);
            expect(result.items[0]?.rollenartenWhitelist).toEqual(serviceProvider.rollenartenWhitelist);
        });

        it('should handle undefined rollenerweiterungenWithName', async () => {
            const params: ManageableServiceProvidersParams = { kategorien: [], limit: 10, offset: 0 };
            const total: number = 1;
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);

            const manageableObjects: ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount[] = [
                {
                    serviceProvider: serviceProvider,
                    organisation: DoFactory.createOrganisation(true),
                    rollen: [DoFactory.createRolle(true)],
                    hasRollenerweiterungen: false,
                    // rollenerweiterungenWithName is undefined (not included)
                    hasSomeVerwaltenPermission: true,
                },
            ];

            serviceProviderServiceMock.findAuthorized.mockResolvedValue([manageableObjects, total]);

            const result: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                await providerController.getManageableServiceProviders(personPermissionsMock, params);

            expect(result).toBeDefined();
            expect(result.items).toHaveLength(1);
            expect(result.items[0]).toBeInstanceOf(ManageableServiceProviderSimpleListEntryResponse);
            // Verify that the empty array was used instead of undefined
            expect(result.items[0]?.hasRollenerweiterungen).toBe(false);
            expect(result.items[0]?.rollenartenWhitelist).toEqual(serviceProvider.rollenartenWhitelist);
        });
    });

    describe('createServiceProvider', () => {
        const tinyPngBase64: string =
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBg0GwHjcAAAAASUVORK5CYII=';
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should create a new service provider when user has permission', async () => {
            const body: CreateServiceProviderBodyParams = new CreateServiceProviderBodyParams();
            Object.assign(body, {
                name: faker.company.name(),
                target: ServiceProviderTarget.EMAIL,
                url: faker.internet.url(),
                kategorie: ServiceProviderKategorie.EMAIL,
                logoId: undefined,
                logoBase64: tinyPngBase64,
                requires2fa: false,
                vidisAngebotId: undefined,
                merkmale: [],
                rollenartenWhitelist: [RollenArt.LEHR],
                organisationId: faker.string.uuid(),
            });

            const createdDomainSp: ServiceProvider<false> = DoFactory.createServiceProvider(false);
            const persistedSp: ServiceProvider<true> = DoFactory.createServiceProvider(true);

            personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            serviceProviderFactoryMock.createNew.mockReturnValueOnce(Ok(createdDomainSp));
            serviceProviderModificationServiceMock.create.mockResolvedValueOnce(Ok(persistedSp));

            const result: CreateServiceProviderResponse = await providerController.createServiceProvider(
                personPermissionsMock,
                body,
            );

            expect(result).toBeDefined();
            expect(serviceProviderFactoryMock.createNew).toHaveBeenCalledWith(
                body.name,
                ServiceProviderTarget.URL,
                body.url,
                body.kategorie,
                body.organisationId,
                body.logoId,
                Buffer.from(tinyPngBase64, 'base64'),
                undefined,
                undefined,
                undefined,
                ServiceProviderSystem.NONE,
                body.requires2fa,
                undefined,
                body.merkmale,
                body.rollenartenWhitelist,
            );
            expect(serviceProviderModificationServiceMock.create).toHaveBeenCalledWith(
                personPermissionsMock,
                createdDomainSp,
            );
            expect(result).toBeInstanceOf(CreateServiceProviderResponse);
        });

        it('should create a new service provider without logo when user has permission', async () => {
            const body: CreateServiceProviderBodyParams = new CreateServiceProviderBodyParams();
            Object.assign(body, {
                name: faker.company.name(),
                target: ServiceProviderTarget.EMAIL,
                url: faker.internet.url(),
                kategorie: ServiceProviderKategorie.EMAIL,
                logoId: undefined,
                logoBase64: undefined,
                requires2fa: false,
                vidisAngebotId: undefined,
                merkmale: [],
                organisationId: faker.string.uuid(),
            });

            const createdDomainSp: ServiceProvider<false> = DoFactory.createServiceProvider(false);
            const persistedSp: ServiceProvider<true> = DoFactory.createServiceProvider(true);

            personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            serviceProviderFactoryMock.createNew.mockReturnValueOnce(Ok(createdDomainSp));
            serviceProviderModificationServiceMock.create.mockResolvedValueOnce(Ok(persistedSp));

            const result: CreateServiceProviderResponse = await providerController.createServiceProvider(
                personPermissionsMock,
                body,
            );

            expect(result).toBeDefined();
            expect(serviceProviderFactoryMock.createNew).toHaveBeenCalledWith(
                body.name,
                ServiceProviderTarget.URL,
                body.url,
                body.kategorie,
                body.organisationId,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                ServiceProviderSystem.NONE,
                body.requires2fa,
                undefined,
                body.merkmale,
                [],
            );
            expect(serviceProviderModificationServiceMock.create).toHaveBeenCalledWith(
                personPermissionsMock,
                createdDomainSp,
            );
            expect(result).toBeInstanceOf(CreateServiceProviderResponse);
        });

        it('should throw error when factory returns error', async () => {
            const body: CreateServiceProviderBodyParams = new CreateServiceProviderBodyParams();
            Object.assign(body, {
                name: faker.company.name(),
                target: ServiceProviderTarget.EMAIL,
                url: undefined,
                kategorie: ServiceProviderKategorie.HINWEISE,
                logoId: faker.number.int({ min: 1, max: 1000 }),
                logoBase64: tinyPngBase64,
                requires2fa: false,
                vidisAngebotId: undefined,
                merkmale: [],
                organisationId: faker.string.uuid(),
            });

            serviceProviderFactoryMock.createNew.mockReturnValueOnce(
                Err(new InvalidLogoCombinationError('Only Logo or LogoId allowed, not both')),
            );

            await expect(() =>
                providerController.createServiceProvider(personPermissionsMock, body),
            ).rejects.toBeInstanceOf(InvalidLogoCombinationError);
            expect(serviceProviderModificationServiceMock.create).not.toHaveBeenCalled();
        });

        it('should throw error when repo returns error', async () => {
            const body: CreateServiceProviderBodyParams = new CreateServiceProviderBodyParams();
            Object.assign(body, {
                name: faker.company.name(),
                target: ServiceProviderTarget.EMAIL,
                url: undefined,
                kategorie: ServiceProviderKategorie.HINWEISE,
                requires2fa: false,
                vidisAngebotId: undefined,
                merkmale: [],
                organisationId: faker.string.uuid(),
            });

            const createdDomainSp: ServiceProvider<false> = DoFactory.createServiceProvider(false);
            serviceProviderFactoryMock.createNew.mockReturnValueOnce(Ok(createdDomainSp));
            serviceProviderModificationServiceMock.create.mockResolvedValueOnce(
                Err(new MissingPermissionsError('Error')),
            );

            await expect(() =>
                providerController.createServiceProvider(personPermissionsMock, body),
            ).rejects.toBeInstanceOf(MissingPermissionsError);
        });
    });

    describe('updateServiceProvider', () => {
        const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
        const angebotId: string = faker.string.uuid();

        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should update service provider when user has permission', async () => {
            const body: UpdateServiceProviderBodyParams = new UpdateServiceProviderBodyParams();
            Object.assign(body, {
                name: faker.company.name(),
                url: faker.internet.url(),
            });

            const existingEntity: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                logo: undefined,
                logoMimeType: undefined,
            });
            const updatedEntity: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                ...existingEntity,
                ...{
                    name: body.name,
                    url: body.url,
                },
            });

            serviceProviderRepoMock.findById.mockResolvedValueOnce(existingEntity);
            serviceProviderModificationServiceMock.update.mockResolvedValueOnce(Ok(updatedEntity));

            const result: ServiceProviderResponse = await providerController.updateServiceProvider(
                permissions,
                angebotId,
                body,
            );

            expect(serviceProviderRepoMock.findById).toHaveBeenCalledWith(angebotId, { withLogo: true });
            expect(serviceProviderModificationServiceMock.update).toHaveBeenCalledWith(
                permissions,
                expect.objectContaining({
                    id: existingEntity.id,
                    name: body.name,
                    url: body.url,
                }),
            );

            expect(result).toBeDefined();
            expect(result).toBeInstanceOf(ServiceProviderResponse);
            expect(result.id).toBe(updatedEntity.id);
            expect(loggerMock.info).toHaveBeenCalledWith(
                `ServiceProvider mit Id ${angebotId} erfolgreich aktualisiert.`,
            );
        });

        it('should throw the error when service-provider does not exist', async () => {
            const body: UpdateServiceProviderBodyParams = { name: 'Updated name' };

            serviceProviderRepoMock.findById.mockResolvedValueOnce(undefined);

            await expect(providerController.updateServiceProvider(permissions, angebotId, body)).rejects.toThrow(
                EntityNotFoundError,
            );
        });

        it('should throw the error when modification service returns Err', async () => {
            const body: UpdateServiceProviderBodyParams = { name: 'Invalid' };
            const error: MissingAttributeError = new MissingAttributeError('Missing attribute');

            const existingEntity: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                logo: undefined,
                logoMimeType: undefined,
            });

            serviceProviderRepoMock.findById.mockResolvedValueOnce(existingEntity);
            serviceProviderModificationServiceMock.update.mockResolvedValueOnce(Err(error));

            await expect(providerController.updateServiceProvider(permissions, angebotId, body)).rejects.toThrow(
                MissingAttributeError,
            );
        });
    });
});
