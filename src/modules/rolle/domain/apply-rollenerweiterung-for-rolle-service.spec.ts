import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RolleRepo } from '../repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../repo/rollenerweiterung.repo.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { Rollenerweiterung } from './rollenerweiterung.js';
import { Rolle } from './rolle.js';
import { Ok } from '../../../shared/util/result.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { faker } from '@faker-js/faker';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { MissingPermissionsError } from '../../../shared/error/index.js';
import { MissingMerkmalVerfuegbarFuerRollenerweiterungError } from './missing-merkmal-verfuegbar-fuer-rollenerweiterung.error.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { Test, TestingModule } from '@nestjs/testing';
import {
    createPersonPermissionsMock,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ApplyRollenerweiterungChangesBodyParams } from '../api/apply-rollenerweiterung-changes.body.params.js';
import { RollenMerkmal } from './rolle.enums.js';
import { ApplyRollenerweiterungForRolleService } from './apply-rollenerweiterungen-for-rolle-service.js';
import { ApplyRollenerweiterungError } from '../api/apply-rollenerweiterung.error.js';

describe('ApplyRollenerweiterungForRolleService', () => {
    let serviceProviderRepo: DeepMocked<ServiceProviderRepo>;
    let organisationRepo: DeepMocked<OrganisationRepository>;
    let rolleRepo: DeepMocked<RolleRepo>;
    let rollenerweiterungRepo: DeepMocked<RollenerweiterungRepo>;
    let service: ApplyRollenerweiterungForRolleService;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [
                {
                    provide: RollenerweiterungRepo,
                    useValue: createMock(RollenerweiterungRepo),
                },
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: ServiceProviderRepo,
                    useValue: createMock(ServiceProviderRepo),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                ApplyRollenerweiterungForRolleService,
            ],
        }).compile();

        serviceProviderRepo = module.get(ServiceProviderRepo);
        organisationRepo = module.get(OrganisationRepository);
        rolleRepo = module.get(RolleRepo);
        rollenerweiterungRepo = module.get(RollenerweiterungRepo);
        service = module.get(ApplyRollenerweiterungForRolleService);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('applyRollenerweiterungChangesForRolle', () => {
        type TresultType = Result<
            null,
            | ApplyRollenerweiterungError
            | EntityNotFoundError
            | MissingPermissionsError
            | MissingMerkmalVerfuegbarFuerRollenerweiterungError
        >;

        it('should add and remove Erweiterungen for service providers successfully', async () => {
            const orgaId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const serviceProviderIdAdd: string = faker.string.uuid();
            const serviceProviderIdRemove: string = faker.string.uuid();

            organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));

            const rolle: Rolle<true> = createMock<Rolle<true>>(Rolle, {
                id: rolleId,
                merkmale: [],
            });
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolleId, rolle]]));

            const existingErw: Rollenerweiterung<true> = createMock<Rollenerweiterung<true>>(Rollenerweiterung, {
                serviceProviderId: serviceProviderIdRemove,
            });
            rollenerweiterungRepo.findManyByOrganisationAndRolle.mockResolvedValue([existingErw]);

            const serviceProviderAdd: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                id: serviceProviderIdAdd,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });
            const serviceProviderRemove: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                id: serviceProviderIdRemove,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });

            serviceProviderRepo.findByIds.mockResolvedValue(
                new Map([
                    [serviceProviderIdAdd, serviceProviderAdd],
                    [serviceProviderIdRemove, serviceProviderRemove],
                ]),
            );

            rollenerweiterungRepo.createAuthorized.mockResolvedValue(
                Ok(createMock<Rollenerweiterung<true>>(Rollenerweiterung)),
            );
            rollenerweiterungRepo.deleteByComposedId.mockResolvedValue(Ok(null));

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [serviceProviderIdAdd],
                removeErweiterungenForServiceProviderIds: [serviceProviderIdRemove],
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const result: TresultType = await service.applyRollenerweiterungChangesForRolle(
                orgaId,
                rolleId,
                body,
                permissions,
            );

            expect(result.ok).toBe(true);
            expect(rollenerweiterungRepo.createAuthorized).toHaveBeenCalledWith(
                expect.objectContaining({
                    organisationId: orgaId,
                    rolleId,
                    serviceProviderId: serviceProviderIdAdd,
                }) as Rollenerweiterung<false>,
                permissions,
            );
            expect(rollenerweiterungRepo.deleteByComposedId).toHaveBeenCalledWith(
                expect.objectContaining({
                    organisationId: orgaId,
                    rolleId,
                    serviceProviderId: serviceProviderIdRemove,
                }) as Rollenerweiterung<false>,
            );
        });

        it('should return error if Permissions are missing', async () => {
            const orgaId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [],
                removeErweiterungenForServiceProviderIds: [],
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(false);

            const result: TresultType = await service.applyRollenerweiterungChangesForRolle(
                orgaId,
                rolleId,
                body,
                permissions,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                return;
            }
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
        });

        it('should return error if Organisation is missing', async () => {
            const orgaId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            organisationRepo.findById.mockResolvedValue(undefined);

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [],
                removeErweiterungenForServiceProviderIds: [],
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const result: TresultType = await service.applyRollenerweiterungChangesForRolle(
                orgaId,
                rolleId,
                body,
                permissions,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                return;
            }
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return error if Rolle is missing', async () => {
            const orgaId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));
            rolleRepo.findByIds.mockResolvedValue(new Map());

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [],
                removeErweiterungenForServiceProviderIds: [],
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const result: TresultType = await service.applyRollenerweiterungChangesForRolle(
                orgaId,
                rolleId,
                body,
                permissions,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                return;
            }
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return error if ServiceProvider not found for add', async () => {
            const orgaId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();

            organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));

            const rolle: Rolle<true> = createMock<Rolle<true>>(Rolle, {
                id: rolleId,
                merkmale: [],
            });
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolleId, rolle]]));

            rollenerweiterungRepo.findManyByOrganisationAndRolle.mockResolvedValue([]);
            serviceProviderRepo.findByIds.mockResolvedValue(new Map());

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [serviceProviderId],
                removeErweiterungenForServiceProviderIds: [],
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const result: TresultType = await service.applyRollenerweiterungChangesForRolle(
                orgaId,
                rolleId,
                body,
                permissions,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                return;
            }

            expect(result.error).toBeInstanceOf(ApplyRollenerweiterungError);

            const err: unknown = result.error;
            if (!(err instanceof ApplyRollenerweiterungError)) {
                return;
            }

            expect(err.errors[0]?.id).toBe(serviceProviderId);
            expect(err.errors[0]?.error).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return error if ServiceProvider not found for remove', async () => {
            const orgaId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();

            organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));

            const rolle: Rolle<true> = createMock<Rolle<true>>(Rolle, {
                id: rolleId,
                merkmale: [],
            });
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolleId, rolle]]));

            const existingErw: Rollenerweiterung<true> = createMock<Rollenerweiterung<true>>(Rollenerweiterung, {
                serviceProviderId,
            });
            rollenerweiterungRepo.findManyByOrganisationAndRolle.mockResolvedValue([existingErw]);

            serviceProviderRepo.findByIds.mockResolvedValue(new Map());

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [],
                removeErweiterungenForServiceProviderIds: [serviceProviderId],
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const result: TresultType = await service.applyRollenerweiterungChangesForRolle(
                orgaId,
                rolleId,
                body,
                permissions,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                return;
            }

            expect(result.error).toBeInstanceOf(ApplyRollenerweiterungError);

            const err: unknown = result.error;
            if (!(err instanceof ApplyRollenerweiterungError)) {
                return;
            }

            expect(err.errors[0]?.id).toBe(serviceProviderId);
            expect(err.errors[0]?.error).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return error if ServiceProvider is not erweiterbar for add', async () => {
            const orgaId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();

            organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));

            const rolle: Rolle<true> = createMock<Rolle<true>>(Rolle, {
                id: rolleId,
                merkmale: [],
            });
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolleId, rolle]]));

            rollenerweiterungRepo.findManyByOrganisationAndRolle.mockResolvedValue([]);

            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                id: serviceProviderId,
                merkmale: [],
            });

            serviceProviderRepo.findByIds.mockResolvedValue(new Map([[serviceProviderId, serviceProvider]]));

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [serviceProviderId],
                removeErweiterungenForServiceProviderIds: [],
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const result: TresultType = await service.applyRollenerweiterungChangesForRolle(
                orgaId,
                rolleId,
                body,
                permissions,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                return;
            }

            expect(result.error).toBeInstanceOf(ApplyRollenerweiterungError);

            const err: unknown = result.error;
            if (!(err instanceof ApplyRollenerweiterungError)) {
                return;
            }

            expect(err.errors[0]?.id).toBe(serviceProviderId);
            expect(err.errors[0]?.error).toBeInstanceOf(MissingMerkmalVerfuegbarFuerRollenerweiterungError);
        });

        it('should return error if mpt rolle and user has no permission', async () => {
            const orgaId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();

            organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));

            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                merkmale: [RollenMerkmal.MPT_ROLLE],
            });
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolleId, rolle]]));

            const body: ApplyRollenerweiterungChangesBodyParams = {
                addErweiterungenForServiceProviderIds: [],
                removeErweiterungenForServiceProviderIds: [],
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: TresultType = await service.applyRollenerweiterungChangesForRolle(
                orgaId,
                rolleId,
                body,
                permissions,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                return;
            }
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
        });
    });
});
