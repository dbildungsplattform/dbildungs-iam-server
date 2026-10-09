import { faker } from '@faker-js/faker';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { LoggingTestModule } from '../../../../test/utils/logging-test.module.js';
import { DEFAULT_TIMEOUT_FOR_TESTCONTAINERS } from '../../../../test/utils/timeouts.js';
import { EntityNotFoundError, MissingPermissionsError } from '../../../shared/error/index.js';
import { Ok } from '../../../shared/util/result.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { ApplyRollenerweiterungChangesBodyParams } from '../api/apply-rollenerweiterung-changes.body.params.js';
import { ApplyRollenerweiterungBodyParams } from '../api/apply-rollenerweiterung.body.params.js';
import { ApplyRollenerweiterungError } from '../api/apply-rollenerweiterung.error.js';
import { RolleRepo } from '../repo/rolle.repo.js';
import { ApplyRollenerweiterungService } from './apply-rollenerweiterung-changes.service.js';
import { RollenArt, RollenMerkmal } from './rolle.enums.js';
import { Rolle } from './rolle.js';
import { Rollenerweiterung } from './rollenerweiterung.js';
import { RollenSystemRecht } from './systemrecht.js';
import { InternalRollenerweiterungRepo } from '../repo/internal-rollenerweiterung.repo.js';

describe('ApplyRollenerweiterungChangesService', () => {
    let service: ApplyRollenerweiterungService;
    let organisationRepoMock: DeepMocked<OrganisationRepository>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let serviceProviderRepoMock: DeepMocked<ServiceProviderRepo>;
    let rollenerweiterungRepoMock: DeepMocked<InternalRollenerweiterungRepo>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [
                {
                    provide: OrganisationRepository,
                    useValue: createMock<OrganisationRepository>(OrganisationRepository),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock<RolleRepo>(RolleRepo),
                },
                {
                    provide: ServiceProviderRepo,
                    useValue: createMock<ServiceProviderRepo>(ServiceProviderRepo),
                },
                {
                    provide: InternalRollenerweiterungRepo,
                    useValue: createMock<InternalRollenerweiterungRepo>(InternalRollenerweiterungRepo),
                },
                ApplyRollenerweiterungService,
            ],
        }).compile();

        service = module.get(ApplyRollenerweiterungService);
        organisationRepoMock = module.get(OrganisationRepository);
        rolleRepoMock = module.get(RolleRepo);
        serviceProviderRepoMock = module.get(ServiceProviderRepo);
        rollenerweiterungRepoMock = module.get(InternalRollenerweiterungRepo);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    function createPermissions(
        hasBasePermission: boolean = true,
        hasMptPermission: boolean = true,
    ): DeepMocked<PersonPermissions> {
        const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

        permissions.hasSystemrechtAtOrganisation.mockImplementation(
            // eslint-disable-next-line @typescript-eslint/require-await
            async (_organisationId: string, systemrecht: RollenSystemRecht): Promise<boolean> => {
                if (systemrecht === RollenSystemRecht.ROLLEN_ERWEITERN) {
                    return hasBasePermission;
                }

                if (systemrecht === RollenSystemRecht.MPT_ROLLEN_ZUORDNEN) {
                    return hasMptPermission;
                }

                return false;
            },
        );

        return permissions;
    }

    function createValidRolle(
        overrides: Partial<{
            id: string;
            merkmale: RollenMerkmal[];
            rollenart: RollenArt;
            serviceProviderIds: string[];
        }> = {},
    ): Rolle<true> {
        return DoFactory.createRolle(true, {
            id: overrides.id ?? faker.string.uuid(),
            merkmale: overrides.merkmale ?? [],
            rollenart: overrides.rollenart ?? RollenArt.LEHR,
            serviceProviderIds: overrides.serviceProviderIds ?? [],
        });
    }

    function createValidServiceProvider(
        overrides: Partial<{
            id: string;
            merkmale: ServiceProviderMerkmal[];
            rollenartenWhitelist: RollenArt[];
        }> = {},
    ): ServiceProvider<true> {
        return DoFactory.createServiceProvider(true, {
            id: overrides.id ?? faker.string.uuid(),
            merkmale: overrides.merkmale ?? [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            rollenartenWhitelist: overrides.rollenartenWhitelist ?? [],
        });
    }

    function createPersistedRollenerweiterung(
        organisationId: string,
        rolleId: string,
        serviceProviderId: string,
    ): Rollenerweiterung<true> {
        return DoFactory.createRollenerweiterung<true>(true, {
            organisationId,
            rolleId,
            serviceProviderId,
        });
    }

    describe('applyRollenerweiterungChangesForRolle', () => {
        it('should add and remove Rollenerweiterungen successfully', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const serviceProviderIdToAdd: string = faker.string.uuid();
            const serviceProviderIdToRemove: string = faker.string.uuid();

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
            });

            const rolle: Rolle<true> = createValidRolle({
                id: rolleId,
            });

            const serviceProviderToAdd: ServiceProvider<true> = createValidServiceProvider({
                id: serviceProviderIdToAdd,
            });

            const serviceProviderToRemove: ServiceProvider<true> = createValidServiceProvider({
                id: serviceProviderIdToRemove,
            });

            const existingRollenerweiterung: Rollenerweiterung<true> = createPersistedRollenerweiterung(
                organisationId,
                rolleId,
                serviceProviderIdToRemove,
            );

            const persistedRollenerweiterung: Rollenerweiterung<true> = createPersistedRollenerweiterung(
                organisationId,
                rolleId,
                serviceProviderIdToAdd,
            );

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolleId, rolle]]));

            rollenerweiterungRepoMock.findManyByOrganisationAndRolle.mockResolvedValueOnce([existingRollenerweiterung]);

            serviceProviderRepoMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [serviceProviderIdToAdd, serviceProviderToAdd],
                    [serviceProviderIdToRemove, serviceProviderToRemove],
                ]),
            );

            rollenerweiterungRepoMock.create.mockResolvedValueOnce(persistedRollenerweiterung);

            rollenerweiterungRepoMock.deleteByComposedId.mockResolvedValueOnce(Ok(null));

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [serviceProviderIdToAdd],
                removeErweiterungenForServiceProviderIds: [serviceProviderIdToRemove],
            };

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForRolle(organisationId, rolleId, body, permissions);

            expect(result.ok).toBe(true);
            expect(permissions.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                organisationId,
                RollenSystemRecht.ROLLEN_ERWEITERN,
            );
            expect(rollenerweiterungRepoMock.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    organisationId,
                    rolleId,
                    serviceProviderId: serviceProviderIdToAdd,
                }),
            );
            expect(rollenerweiterungRepoMock.deleteByComposedId).toHaveBeenCalledWith({
                organisationId,
                rolleId,
                serviceProviderId: serviceProviderIdToRemove,
            });
        });

        it('should return MissingPermissionsError if base permission is missing', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            const permissions: DeepMocked<PersonPermissions> = createPermissions(false);

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [],
                removeErweiterungenForServiceProviderIds: [],
            };

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForRolle(organisationId, rolleId, body, permissions);

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            expect(organisationRepoMock.findById).not.toHaveBeenCalled();
            expect(rollenerweiterungRepoMock.create).not.toHaveBeenCalled();
        });

        it('should return EntityNotFoundError if organisation does not exist', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            organisationRepoMock.findById.mockResolvedValueOnce(undefined);

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map());

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [],
                removeErweiterungenForServiceProviderIds: [],
            };

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForRolle(organisationId, rolleId, body, permissions);

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
            expect(rollenerweiterungRepoMock.findManyByOrganisationAndRolle).not.toHaveBeenCalled();
        });

        it('should return EntityNotFoundError if Rolle does not exist', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            organisationRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, {
                    id: organisationId,
                }),
            );

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map());

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [],
                removeErweiterungenForServiceProviderIds: [],
            };

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForRolle(organisationId, rolleId, body, permissions);

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
            expect(rollenerweiterungRepoMock.create).not.toHaveBeenCalled();
        });

        it('should require MPT permission for an MPT Rolle', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
            });

            const rolle: Rolle<true> = createValidRolle({
                id: rolleId,
                merkmale: [RollenMerkmal.MPT_ROLLE],
            });

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolleId, rolle]]));

            const permissions: DeepMocked<PersonPermissions> = createPermissions(true, false);

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [],
                removeErweiterungenForServiceProviderIds: [],
            };

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForRolle(organisationId, rolleId, body, permissions);

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            expect(permissions.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                organisationId,
                RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
            );
            expect(rollenerweiterungRepoMock.create).not.toHaveBeenCalled();
        });

        it('should treat an already existing Rollenerweiterung as idempotent', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
            });

            const rolle: Rolle<true> = createValidRolle({
                id: rolleId,
            });

            const existing: Rollenerweiterung<true> = createPersistedRollenerweiterung(
                organisationId,
                rolleId,
                serviceProviderId,
            );

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolleId, rolle]]));

            rollenerweiterungRepoMock.findManyByOrganisationAndRolle.mockResolvedValueOnce([existing]);

            serviceProviderRepoMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [
                        serviceProviderId,
                        createValidServiceProvider({
                            id: serviceProviderId,
                        }),
                    ],
                ]),
            );

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [serviceProviderId],
                removeErweiterungenForServiceProviderIds: [],
            };

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForRolle(organisationId, rolleId, body, permissions);

            expect(result.ok).toBe(true);
            expect(rollenerweiterungRepoMock.create).not.toHaveBeenCalled();
        });

        it('should return ApplyRollenerweiterungError if a requested ServiceProvider does not exist', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();

            organisationRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, {
                    id: organisationId,
                }),
            );

            const rolle: Rolle<true> = createValidRolle({
                id: rolleId,
            });

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolleId, rolle]]));

            rollenerweiterungRepoMock.findManyByOrganisationAndRolle.mockResolvedValueOnce([]);

            serviceProviderRepoMock.findByIds.mockResolvedValueOnce(new Map());

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [serviceProviderId],
                removeErweiterungenForServiceProviderIds: [],
            };

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForRolle(organisationId, rolleId, body, permissions);

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(ApplyRollenerweiterungError);
            expect(rollenerweiterungRepoMock.create).not.toHaveBeenCalled();
        });

        it('should return ApplyRollenerweiterungError if a ServiceProvider requested for removal does not exist', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
            });

            const rolle: Rolle<true> = createValidRolle({
                id: rolleId,
            });

            const existingRollenerweiterung: Rollenerweiterung<true> = createPersistedRollenerweiterung(
                organisationId,
                rolleId,
                serviceProviderId,
            );

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map<string, Rolle<true>>([[rolleId, rolle]]));

            rollenerweiterungRepoMock.findManyByOrganisationAndRolle.mockResolvedValueOnce([existingRollenerweiterung]);

            serviceProviderRepoMock.findByIds.mockResolvedValueOnce(new Map<string, ServiceProvider<true>>());

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [],
                removeErweiterungenForServiceProviderIds: [serviceProviderId],
            };

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForRolle(organisationId, rolleId, body, permissions);

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(ApplyRollenerweiterungError);
            expect(serviceProviderRepoMock.findByIds).toHaveBeenCalledWith([serviceProviderId]);
            expect(rollenerweiterungRepoMock.deleteByComposedId).not.toHaveBeenCalled();
            expect(rollenerweiterungRepoMock.create).not.toHaveBeenCalled();
        });

        it('should deduplicate requested ServiceProvider IDs', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
            });

            const rolle: Rolle<true> = createValidRolle({
                id: rolleId,
            });

            const serviceProvider: ServiceProvider<true> = createValidServiceProvider({
                id: serviceProviderId,
            });

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolleId, rolle]]));

            rollenerweiterungRepoMock.findManyByOrganisationAndRolle.mockResolvedValueOnce([]);

            serviceProviderRepoMock.findByIds.mockResolvedValueOnce(new Map([[serviceProviderId, serviceProvider]]));

            rollenerweiterungRepoMock.create.mockResolvedValueOnce(
                createPersistedRollenerweiterung(organisationId, rolleId, serviceProviderId),
            );

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [serviceProviderId, serviceProviderId],
                removeErweiterungenForServiceProviderIds: [],
            };

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForRolle(organisationId, rolleId, body, permissions);

            expect(result.ok).toBe(true);
            expect(serviceProviderRepoMock.findByIds).toHaveBeenCalledWith([serviceProviderId]);
            expect(rollenerweiterungRepoMock.create).toHaveBeenCalledTimes(1);
        });

        it('should return ApplyRollenerweiterungError and not persist if the ServiceProvider is unavailable', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
            });

            const rolle: Rolle<true> = createValidRolle({
                id: rolleId,
            });

            const serviceProvider: ServiceProvider<true> = createValidServiceProvider({
                id: serviceProviderId,
                merkmale: [],
            });

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map<string, Rolle<true>>([[rolleId, rolle]]));

            rollenerweiterungRepoMock.findManyByOrganisationAndRolle.mockResolvedValueOnce([]);

            serviceProviderRepoMock.findByIds.mockResolvedValueOnce(
                new Map<string, ServiceProvider<true>>([[serviceProviderId, serviceProvider]]),
            );

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [serviceProviderId],
                removeErweiterungenForServiceProviderIds: [],
            };

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForRolle(organisationId, rolleId, body, permissions);

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(ApplyRollenerweiterungError);
            expect(rollenerweiterungRepoMock.create).not.toHaveBeenCalled();
            expect(rollenerweiterungRepoMock.deleteByComposedId).not.toHaveBeenCalled();
        });

        it('should add a Rollenerweiterung for an MPT Rolle when MPT permission is granted', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
            });

            const rolle: Rolle<true> = createValidRolle({
                id: rolleId,
                merkmale: [RollenMerkmal.MPT_ROLLE],
            });

            const serviceProvider: ServiceProvider<true> = createValidServiceProvider({
                id: serviceProviderId,
            });

            const persistedRollenerweiterung: Rollenerweiterung<true> = createPersistedRollenerweiterung(
                organisationId,
                rolleId,
                serviceProviderId,
            );

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map<string, Rolle<true>>([[rolleId, rolle]]));

            rollenerweiterungRepoMock.findManyByOrganisationAndRolle.mockResolvedValueOnce([]);

            serviceProviderRepoMock.findByIds.mockResolvedValueOnce(
                new Map<string, ServiceProvider<true>>([[serviceProviderId, serviceProvider]]),
            );

            rollenerweiterungRepoMock.create.mockResolvedValueOnce(persistedRollenerweiterung);

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [serviceProviderId],
                removeErweiterungenForServiceProviderIds: [],
            };

            const permissions: DeepMocked<PersonPermissions> = createPermissions(true, true);

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForRolle(organisationId, rolleId, body, permissions);

            expect(result.ok).toBe(true);
            expect(permissions.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                1,
                organisationId,
                RollenSystemRecht.ROLLEN_ERWEITERN,
            );
            expect(permissions.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                2,
                organisationId,
                RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
            );
            expect(rollenerweiterungRepoMock.create).toHaveBeenCalledOnce();
        });
    });

    describe('applyRollenerweiterungChangesForAngebot', () => {
        it('should add and remove Rollenerweiterungen successfully', async () => {
            const organisationId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();
            const rolleIdToAdd: string = faker.string.uuid();
            const rolleIdToRemove: string = faker.string.uuid();

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
            });

            const serviceProvider: ServiceProvider<true> = createValidServiceProvider({
                id: serviceProviderId,
            });

            const rolleToAdd: Rolle<true> = createValidRolle({
                id: rolleIdToAdd,
            });

            const rolleToRemove: Rolle<true> = createValidRolle({
                id: rolleIdToRemove,
            });

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            serviceProviderRepoMock.findById.mockResolvedValueOnce(serviceProvider);

            rollenerweiterungRepoMock.findManyByOrganisationIdAndServiceProviderId.mockResolvedValueOnce([
                createPersistedRollenerweiterung(organisationId, rolleIdToRemove, serviceProviderId),
            ]);

            rolleRepoMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [rolleIdToAdd, rolleToAdd],
                    [rolleIdToRemove, rolleToRemove],
                ]),
            );

            rollenerweiterungRepoMock.create.mockResolvedValueOnce(
                createPersistedRollenerweiterung(organisationId, rolleIdToAdd, serviceProviderId),
            );

            rollenerweiterungRepoMock.deleteByComposedId.mockResolvedValueOnce(Ok(null));

            const body: ApplyRollenerweiterungBodyParams = {
                addErweiterungenForRolleIds: [rolleIdToAdd],
                removeErweiterungenForRolleIds: [rolleIdToRemove],
            };

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForAngebot(
                    organisationId,
                    serviceProviderId,
                    body,
                    permissions,
                );

            expect(result.ok).toBe(true);
            expect(rollenerweiterungRepoMock.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    organisationId,
                    rolleId: rolleIdToAdd,
                    serviceProviderId,
                }),
            );
            expect(rollenerweiterungRepoMock.deleteByComposedId).toHaveBeenCalledWith({
                organisationId,
                rolleId: rolleIdToRemove,
                serviceProviderId,
            });
        });

        it('should return MissingPermissionsError if base permission is missing', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPermissions(false);

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForAngebot(
                    faker.string.uuid(),
                    faker.string.uuid(),
                    {
                        addErweiterungenForRolleIds: [],
                        removeErweiterungenForRolleIds: [],
                    },
                    permissions,
                );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            expect(organisationRepoMock.findById).not.toHaveBeenCalled();
        });

        it('should return EntityNotFoundError if Angebot does not exist', async () => {
            const organisationId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();

            organisationRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, {
                    id: organisationId,
                }),
            );

            serviceProviderRepoMock.findById.mockResolvedValueOnce(undefined);

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForAngebot(
                    organisationId,
                    serviceProviderId,
                    {
                        addErweiterungenForRolleIds: [],
                        removeErweiterungenForRolleIds: [],
                    },
                    permissions,
                );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return ApplyRollenerweiterungError for an MPT Rolle without MPT permission', async () => {
            const organisationId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
            });

            const serviceProvider: ServiceProvider<true> = createValidServiceProvider({
                id: serviceProviderId,
            });

            const rolle: Rolle<true> = createValidRolle({
                id: rolleId,
                merkmale: [RollenMerkmal.MPT_ROLLE],
            });

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            serviceProviderRepoMock.findById.mockResolvedValueOnce(serviceProvider);

            rollenerweiterungRepoMock.findManyByOrganisationIdAndServiceProviderId.mockResolvedValueOnce([]);

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolleId, rolle]]));

            const permissions: DeepMocked<PersonPermissions> = createPermissions(true, false);

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForAngebot(
                    organisationId,
                    serviceProviderId,
                    {
                        addErweiterungenForRolleIds: [rolleId],
                        removeErweiterungenForRolleIds: [],
                    },
                    permissions,
                );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(ApplyRollenerweiterungError);
            expect(rollenerweiterungRepoMock.create).not.toHaveBeenCalled();
        });

        it('should return ApplyRollenerweiterungError if a Rolle requested for addition does not exist', async () => {
            const organisationId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
            });

            const serviceProvider: ServiceProvider<true> = createValidServiceProvider({
                id: serviceProviderId,
            });

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            serviceProviderRepoMock.findById.mockResolvedValueOnce(serviceProvider);

            rollenerweiterungRepoMock.findManyByOrganisationIdAndServiceProviderId.mockResolvedValueOnce([]);

            /*
             * The requested Rolle is not present in the loaded map.
             * This exercises the missing-role branch in
             * addRollenerweiterungenForAngebot().
             */
            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map<string, Rolle<true>>());

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const body: ApplyRollenerweiterungBodyParams = {
                addErweiterungenForRolleIds: [rolleId],
                removeErweiterungenForRolleIds: [],
            };

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForAngebot(
                    organisationId,
                    serviceProviderId,
                    body,
                    permissions,
                );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(ApplyRollenerweiterungError);
            expect(rolleRepoMock.findByIds).toHaveBeenCalledWith([rolleId]);
            expect(rollenerweiterungRepoMock.create).not.toHaveBeenCalled();
            expect(rollenerweiterungRepoMock.deleteByComposedId).not.toHaveBeenCalled();
        });

        it('should return ApplyRollenerweiterungError if a Rolle requested for removal does not exist', async () => {
            const organisationId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
            });

            const serviceProvider: ServiceProvider<true> = createValidServiceProvider({
                id: serviceProviderId,
            });

            const existingRollenerweiterung: Rollenerweiterung<true> = createPersistedRollenerweiterung(
                organisationId,
                rolleId,
                serviceProviderId,
            );

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            serviceProviderRepoMock.findById.mockResolvedValueOnce(serviceProvider);

            rollenerweiterungRepoMock.findManyByOrganisationIdAndServiceProviderId.mockResolvedValueOnce([
                existingRollenerweiterung,
            ]);

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map<string, Rolle<true>>());

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const body: ApplyRollenerweiterungBodyParams = {
                addErweiterungenForRolleIds: [],
                removeErweiterungenForRolleIds: [rolleId],
            };

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForAngebot(
                    organisationId,
                    serviceProviderId,
                    body,
                    permissions,
                );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(ApplyRollenerweiterungError);
            expect(rolleRepoMock.findByIds).toHaveBeenCalledWith([rolleId]);
            expect(rollenerweiterungRepoMock.deleteByComposedId).not.toHaveBeenCalled();
            expect(rollenerweiterungRepoMock.create).not.toHaveBeenCalled();
        });

        it('should return ApplyRollenerweiterungError when removing an MPT Rolle without MPT permission', async () => {
            const organisationId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
            });

            const serviceProvider: ServiceProvider<true> = createValidServiceProvider({
                id: serviceProviderId,
            });

            const rolle: Rolle<true> = createValidRolle({
                id: rolleId,
                merkmale: [RollenMerkmal.MPT_ROLLE],
            });

            const existingRollenerweiterung: Rollenerweiterung<true> = createPersistedRollenerweiterung(
                organisationId,
                rolleId,
                serviceProviderId,
            );

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            serviceProviderRepoMock.findById.mockResolvedValueOnce(serviceProvider);

            rollenerweiterungRepoMock.findManyByOrganisationIdAndServiceProviderId.mockResolvedValueOnce([
                existingRollenerweiterung,
            ]);

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map<string, Rolle<true>>([[rolleId, rolle]]));

            const permissions: DeepMocked<PersonPermissions> = createPermissions(true, false);

            const body: ApplyRollenerweiterungBodyParams = {
                addErweiterungenForRolleIds: [],
                removeErweiterungenForRolleIds: [rolleId],
            };

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForAngebot(
                    organisationId,
                    serviceProviderId,
                    body,
                    permissions,
                );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(ApplyRollenerweiterungError);
            expect(permissions.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                organisationId,
                RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
            );
            expect(rollenerweiterungRepoMock.deleteByComposedId).not.toHaveBeenCalled();
            expect(rollenerweiterungRepoMock.create).not.toHaveBeenCalled();
        });

        it('should treat an already existing Rollenerweiterung as idempotent', async () => {
            const organisationId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            organisationRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, {
                    id: organisationId,
                }),
            );

            serviceProviderRepoMock.findById.mockResolvedValueOnce(
                createValidServiceProvider({
                    id: serviceProviderId,
                }),
            );

            rollenerweiterungRepoMock.findManyByOrganisationIdAndServiceProviderId.mockResolvedValueOnce([
                createPersistedRollenerweiterung(organisationId, rolleId, serviceProviderId),
            ]);

            rolleRepoMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [
                        rolleId,
                        createValidRolle({
                            id: rolleId,
                        }),
                    ],
                ]),
            );

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForAngebot(
                    organisationId,
                    serviceProviderId,
                    {
                        addErweiterungenForRolleIds: [rolleId],
                        removeErweiterungenForRolleIds: [],
                    },
                    permissions,
                );

            expect(result.ok).toBe(true);
            expect(rollenerweiterungRepoMock.create).not.toHaveBeenCalled();
        });

        it('should return EntityNotFoundError if Organisation does not exist', async () => {
            const organisationId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();

            organisationRepoMock.findById.mockResolvedValueOnce(undefined);

            serviceProviderRepoMock.findById.mockResolvedValueOnce(
                createValidServiceProvider({
                    id: serviceProviderId,
                }),
            );

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const body: ApplyRollenerweiterungBodyParams = {
                addErweiterungenForRolleIds: [],
                removeErweiterungenForRolleIds: [],
            };

            const result: Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError> =
                await service.applyRollenerweiterungChangesForAngebot(
                    organisationId,
                    serviceProviderId,
                    body,
                    permissions,
                );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
            expect(organisationRepoMock.findById).toHaveBeenCalledWith(organisationId);
            expect(serviceProviderRepoMock.findById).toHaveBeenCalledWith(serviceProviderId);
            expect(rollenerweiterungRepoMock.findManyByOrganisationIdAndServiceProviderId).not.toHaveBeenCalled();
            expect(rolleRepoMock.findByIds).not.toHaveBeenCalled();
        });
    });

    describe('findRollenerweiterungenForRolleAndOrganisation', () => {
        it('should return referenced ServiceProviders', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const serviceProviderIdA: string = faker.string.uuid();
            const serviceProviderIdB: string = faker.string.uuid();

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
            });

            const rolle: Rolle<true> = createValidRolle({
                id: rolleId,
            });

            const serviceProviderA: ServiceProvider<true> = createValidServiceProvider({
                id: serviceProviderIdA,
            });

            const serviceProviderB: ServiceProvider<true> = createValidServiceProvider({
                id: serviceProviderIdB,
            });

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolleId, rolle]]));

            rollenerweiterungRepoMock.findManyByOrganisationAndRolle.mockResolvedValueOnce([
                createPersistedRollenerweiterung(organisationId, rolleId, serviceProviderIdA),
                createPersistedRollenerweiterung(organisationId, rolleId, serviceProviderIdB),
            ]);

            serviceProviderRepoMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [serviceProviderIdA, serviceProviderA],
                    [serviceProviderIdB, serviceProviderB],
                ]),
            );

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const result: Result<ServiceProvider<true>[], MissingPermissionsError | EntityNotFoundError> =
                await service.findRollenerweiterungenForRolleAndOrganisation(organisationId, rolleId, permissions);

            expect(result.ok).toBe(true);
            if (!result.ok) {
                throw result.error;
            }
            expect(result.value).toEqual([serviceProviderA, serviceProviderB]);
            expect(serviceProviderRepoMock.findByIds).toHaveBeenCalledWith([serviceProviderIdA, serviceProviderIdB]);
        });

        it('should return an empty array if no Rollenerweiterungen exist', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            organisationRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, {
                    id: organisationId,
                }),
            );

            rolleRepoMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [
                        rolleId,
                        createValidRolle({
                            id: rolleId,
                        }),
                    ],
                ]),
            );

            rollenerweiterungRepoMock.findManyByOrganisationAndRolle.mockResolvedValueOnce([]);

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const result: Result<ServiceProvider<true>[], MissingPermissionsError | EntityNotFoundError> =
                await service.findRollenerweiterungenForRolleAndOrganisation(organisationId, rolleId, permissions);

            expect(result).toEqual(Ok([]));
            expect(serviceProviderRepoMock.findByIds).not.toHaveBeenCalled();
        });

        it('should return MissingPermissionsError before loading references', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPermissions(false);

            const result: Result<ServiceProvider<true>[], MissingPermissionsError | EntityNotFoundError> =
                await service.findRollenerweiterungenForRolleAndOrganisation(
                    faker.string.uuid(),
                    faker.string.uuid(),
                    permissions,
                );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            expect(organisationRepoMock.findById).not.toHaveBeenCalled();
            expect(rollenerweiterungRepoMock.findManyByOrganisationAndRolle).not.toHaveBeenCalled();
        });

        it('should return EntityNotFoundError if Rolle does not exist', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            organisationRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, {
                    id: organisationId,
                }),
            );

            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map());

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const result: Result<ServiceProvider<true>[], MissingPermissionsError | EntityNotFoundError> =
                await service.findRollenerweiterungenForRolleAndOrganisation(organisationId, rolleId, permissions);

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
            expect(rollenerweiterungRepoMock.findManyByOrganisationAndRolle).not.toHaveBeenCalled();
        });

        it('should deduplicate ServiceProvider IDs before loading them', async () => {
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();

            organisationRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, {
                    id: organisationId,
                }),
            );

            rolleRepoMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [
                        rolleId,
                        createValidRolle({
                            id: rolleId,
                        }),
                    ],
                ]),
            );

            rollenerweiterungRepoMock.findManyByOrganisationAndRolle.mockResolvedValueOnce([
                createPersistedRollenerweiterung(organisationId, rolleId, serviceProviderId),
                createPersistedRollenerweiterung(organisationId, rolleId, serviceProviderId),
            ]);

            serviceProviderRepoMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [
                        serviceProviderId,
                        createValidServiceProvider({
                            id: serviceProviderId,
                        }),
                    ],
                ]),
            );

            const permissions: DeepMocked<PersonPermissions> = createPermissions();

            const result: Result<ServiceProvider<true>[], MissingPermissionsError | EntityNotFoundError> =
                await service.findRollenerweiterungenForRolleAndOrganisation(organisationId, rolleId, permissions);

            expect(result.ok).toBe(true);
            expect(serviceProviderRepoMock.findByIds).toHaveBeenCalledWith([serviceProviderId]);
        });
    });
});
