import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RolleRepo } from '../repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../repo/rollenerweiterung.repo.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { ApplyRollenerweiterungBodyParams } from '../api/apply-rollenerweiterung.body.params.js';
import { Rollenerweiterung } from './rollenerweiterung.js';
import { Rolle } from './rolle.js';
import { Ok } from '../../../shared/util/result.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { ApplyRollenerweiterungError } from '../api/apply-rollenerweiterung.error.js';
import { faker } from '@faker-js/faker';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { ApplyRollenerweiterungForAngebotService } from './apply-rollenerweiterungen-for-angebot-service.js';
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
import { RollenMerkmal } from './rolle.enums.js';

type TresultType = Result<
    null,
    | ApplyRollenerweiterungError
    | EntityNotFoundError
    | MissingPermissionsError
    | MissingMerkmalVerfuegbarFuerRollenerweiterungError
>;

describe('ApplyRollenerweiterungForAngebotService', () => {
    let serviceProviderRepo: DeepMocked<ServiceProviderRepo>;
    let organisationRepo: DeepMocked<OrganisationRepository>;
    let rolleRepo: DeepMocked<RolleRepo>;
    let rollenerweiterungRepo: DeepMocked<RollenerweiterungRepo>;
    let service: ApplyRollenerweiterungForAngebotService;

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
                ApplyRollenerweiterungForAngebotService,
            ],
        }).compile();

        serviceProviderRepo = module.get(ServiceProviderRepo);
        organisationRepo = module.get(OrganisationRepository);
        rolleRepo = module.get(RolleRepo);
        rollenerweiterungRepo = module.get(RollenerweiterungRepo);
        service = module.get(ApplyRollenerweiterungForAngebotService);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should add and remove Erweiterungen successfully', async () => {
        const orgaId: string = faker.string.uuid();
        const angebotId: string = faker.string.uuid();
        const rolleIdAdd: string = faker.string.uuid();
        const rolleIdRemove: string = faker.string.uuid();

        organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));
        serviceProviderRepo.findById.mockResolvedValue(
            DoFactory.createServiceProvider(true, {
                id: angebotId,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            }),
        );

        const existingErw: Rollenerweiterung<true> = createMock<Rollenerweiterung<true>>(Rollenerweiterung, {
            rolleId: rolleIdRemove,
        });
        rollenerweiterungRepo.findManyByOrganisationIdAndServiceProviderId.mockResolvedValue([existingErw]);

        const rolleAdd: Rolle<true> = createMock<Rolle<true>>(Rolle, {
            id: rolleIdAdd,
            merkmale: [],
        });
        const rolleRemove: Rolle<true> = createMock<Rolle<true>>(Rolle, {
            id: rolleIdRemove,
            merkmale: [],
        });
        rolleRepo.findByIds.mockResolvedValue(
            new Map([
                [rolleIdAdd, rolleAdd],
                [rolleIdRemove, rolleRemove],
            ]),
        );

        rollenerweiterungRepo.createAuthorized.mockResolvedValue(
            Ok(createMock<Rollenerweiterung<true>>(Rollenerweiterung)),
        );
        rollenerweiterungRepo.deleteByComposedId.mockResolvedValue(Ok(null));

        const body: ApplyRollenerweiterungBodyParams = {
            addErweiterungenForRolleIds: [rolleIdAdd],
            removeErweiterungenForRolleIds: [rolleIdRemove],
        };
        const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
        permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

        const result: TresultType = await service.applyRollenerweiterungChangesForAngebot(
            orgaId,
            angebotId,
            body,
            permissions,
        );
        expect(result.ok).toBe(true);
        expect(rollenerweiterungRepo.createAuthorized).toHaveBeenCalledWith(
            expect.objectContaining({
                rolleId: rolleIdAdd,
                organisationId: orgaId,
                serviceProviderId: angebotId,
            }) as Rollenerweiterung<false>,
            permissions,
        );
        expect(rollenerweiterungRepo.deleteByComposedId).toHaveBeenCalledWith(
            expect.objectContaining({
                rolleId: rolleIdRemove,
                organisationId: orgaId,
                serviceProviderId: angebotId,
            }) as Rollenerweiterung<false>,
        );
    });

    it('should return error if Permissions are missing', async () => {
        const orgaId: string = faker.string.uuid();
        const angebotId: string = faker.string.uuid();

        organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));
        serviceProviderRepo.findById.mockResolvedValue(
            DoFactory.createServiceProvider(true, {
                id: angebotId,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            }),
        );
        rolleRepo.findByIds.mockResolvedValue(new Map());

        const body: ApplyRollenerweiterungBodyParams = {
            addErweiterungenForRolleIds: [],
            removeErweiterungenForRolleIds: [],
        };
        const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
        permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

        const result: TresultType = await service.applyRollenerweiterungChangesForAngebot(
            orgaId,
            angebotId,
            body,
            permissions,
        );
        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.error).toBeInstanceOf(MissingPermissionsError);
        const err: unknown = result.error;
        if (!(err instanceof MissingPermissionsError)) {
            return;
        }
    });

    it('should return error if Organisation is missing', async () => {
        const orgaId: string = faker.string.uuid();
        const angebotId: string = faker.string.uuid();

        organisationRepo.findById.mockResolvedValue(undefined);
        serviceProviderRepo.findById.mockResolvedValue(
            DoFactory.createServiceProvider(true, {
                id: angebotId,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            }),
        );
        rolleRepo.findByIds.mockResolvedValue(new Map());

        const body: ApplyRollenerweiterungBodyParams = {
            addErweiterungenForRolleIds: [],
            removeErweiterungenForRolleIds: [],
        };
        const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
        permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

        const result: TresultType = await service.applyRollenerweiterungChangesForAngebot(
            orgaId,
            angebotId,
            body,
            permissions,
        );
        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.error).toBeInstanceOf(EntityNotFoundError);
        const err: unknown = result.error;
        if (!(err instanceof EntityNotFoundError)) {
            return;
        }
    });

    it('should return error if Angebot is missing', async () => {
        const orgaId: string = faker.string.uuid();
        const angebotId: string = faker.string.uuid();

        organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));
        serviceProviderRepo.findById.mockResolvedValue(undefined);
        rolleRepo.findByIds.mockResolvedValue(new Map());

        const body: ApplyRollenerweiterungBodyParams = {
            addErweiterungenForRolleIds: [],
            removeErweiterungenForRolleIds: [],
        };
        const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
        permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

        const result: TresultType = await service.applyRollenerweiterungChangesForAngebot(
            orgaId,
            angebotId,
            body,
            permissions,
        );
        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.error).toBeInstanceOf(EntityNotFoundError);
        const err: unknown = result.error;
        if (!(err instanceof EntityNotFoundError)) {
            return;
        }
    });

    it('should return error if Angebot is not erweiterbar', async () => {
        const orgaId: string = faker.string.uuid();
        const angebotId: string = faker.string.uuid();

        organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));
        serviceProviderRepo.findById.mockResolvedValue(
            DoFactory.createServiceProvider(true, { id: angebotId, merkmale: [] }),
        );
        rolleRepo.findByIds.mockResolvedValue(new Map());

        const body: ApplyRollenerweiterungBodyParams = {
            addErweiterungenForRolleIds: [],
            removeErweiterungenForRolleIds: [],
        };
        const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
        permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

        const result: TresultType = await service.applyRollenerweiterungChangesForAngebot(
            orgaId,
            angebotId,
            body,
            permissions,
        );
        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.error).toBeInstanceOf(MissingMerkmalVerfuegbarFuerRollenerweiterungError);
        const err: unknown = result.error;
        if (!(err instanceof MissingMerkmalVerfuegbarFuerRollenerweiterungError)) {
            return;
        }
    });

    it('should return error if Rolle not found for add', async () => {
        const orgaId: string = faker.string.uuid();
        const angebotId: string = faker.string.uuid();
        const rolleId: string = faker.string.uuid();

        rollenerweiterungRepo.findManyByOrganisationIdAndServiceProviderId.mockResolvedValue([]);
        rolleRepo.findByIds.mockResolvedValue(new Map());

        organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));
        serviceProviderRepo.findById.mockResolvedValue(
            DoFactory.createServiceProvider(true, {
                id: angebotId,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            }),
        );

        const body: ApplyRollenerweiterungBodyParams = {
            addErweiterungenForRolleIds: [rolleId],
            removeErweiterungenForRolleIds: [],
        };
        const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
        permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

        const result: TresultType = await service.applyRollenerweiterungChangesForAngebot(
            orgaId,
            angebotId,
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
        expect(err.errors[0]?.id).toBe(rolleId);
        expect(err.errors[0]?.error).toBeInstanceOf(EntityNotFoundError);
    });

    it('should return error if Rolle not found for remove', async () => {
        const rolleIdRemove: string = faker.string.uuid();

        const orgaId: string = faker.string.uuid();
        const angebotId: string = faker.string.uuid();

        organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));
        serviceProviderRepo.findById.mockResolvedValue(
            DoFactory.createServiceProvider(true, {
                id: angebotId,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            }),
        );

        const existingErw: Rollenerweiterung<true> = createMock<Rollenerweiterung<true>>(Rollenerweiterung, {
            rolleId: rolleIdRemove,
        });
        rollenerweiterungRepo.findManyByOrganisationIdAndServiceProviderId.mockResolvedValue([existingErw]);
        rolleRepo.findByIds.mockResolvedValue(new Map());

        const body: ApplyRollenerweiterungBodyParams = {
            addErweiterungenForRolleIds: [],
            removeErweiterungenForRolleIds: [rolleIdRemove],
        };
        const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
        permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

        const result: TresultType = await service.applyRollenerweiterungChangesForAngebot(
            orgaId,
            angebotId,
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
        expect(err.errors[0]?.id).toBe(rolleIdRemove);
        expect(err.errors[0]?.error).toBeInstanceOf(EntityNotFoundError);
    });

    it('should return error when adding MPT Rolle and user has no MPT permission', async () => {
        const rolleAddId: string = faker.string.uuid();

        const orgaId: string = faker.string.uuid();
        const angebotId: string = faker.string.uuid();

        organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));
        serviceProviderRepo.findById.mockResolvedValue(
            DoFactory.createServiceProvider(true, {
                id: angebotId,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            }),
        );

        const rolleAdd: Rolle<true> = DoFactory.createRolle(true, {
            id: rolleAddId,
            merkmale: [RollenMerkmal.MPT_ROLLE],
        });
        rolleRepo.findByIds.mockResolvedValue(new Map([[rolleAddId, rolleAdd]]));

        const body: ApplyRollenerweiterungBodyParams = {
            addErweiterungenForRolleIds: [rolleAddId],
            removeErweiterungenForRolleIds: [],
        };
        const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
        permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

        const result: TresultType = await service.applyRollenerweiterungChangesForAngebot(
            orgaId,
            angebotId,
            body,
            permissions,
        );

        expect(rollenerweiterungRepo.createAuthorized).not.toHaveBeenCalled();

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.error).toBeInstanceOf(ApplyRollenerweiterungError);
    });

    it('should return error when removing MPT Rolle and user has no MPT permission', async () => {
        const rolleRemoveId: string = faker.string.uuid();

        const orgaId: string = faker.string.uuid();
        const angebotId: string = faker.string.uuid();

        organisationRepo.findById.mockResolvedValue(DoFactory.createOrganisation(true, { id: orgaId }));

        serviceProviderRepo.findById.mockResolvedValue(
            DoFactory.createServiceProvider(true, {
                id: angebotId,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            }),
        );

        const rolleRemove: Rolle<true> = DoFactory.createRolle(true, {
            id: rolleRemoveId,
            merkmale: [RollenMerkmal.MPT_ROLLE],
        });

        rolleRepo.findByIds.mockResolvedValue(new Map<string, Rolle<true>>([[rolleRemoveId, rolleRemove]]));

        const existingErweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung(true, {
            organisationId: orgaId,
            rolleId: rolleRemoveId,
            serviceProviderId: angebotId,
        });

        rollenerweiterungRepo.findManyByOrganisationIdAndServiceProviderId.mockResolvedValue([existingErweiterung]);

        const body: ApplyRollenerweiterungBodyParams = {
            addErweiterungenForRolleIds: [],
            removeErweiterungenForRolleIds: [rolleRemoveId],
        };

        const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
        permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

        const result: TresultType = await service.applyRollenerweiterungChangesForAngebot(
            orgaId,
            angebotId,
            body,
            permissions,
        );

        expect(rollenerweiterungRepo.deleteByComposedId).not.toHaveBeenCalled();
        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.error).toBeInstanceOf(ApplyRollenerweiterungError);
    });
});
