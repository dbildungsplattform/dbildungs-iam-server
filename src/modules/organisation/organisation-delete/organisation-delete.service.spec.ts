import { faker } from '@faker-js/faker';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/index.js';
import { DomainError, MissingPermissionsError } from '../../../shared/error/index.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID } from '../../../shared/types/index.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { OrganisationHasChildrenError } from './errors/organisation-has-children.error.js';
import { OrganisationHasPersonenkontexteError } from './errors/organisation-has-personenkontexte.error.js';
import { OrganisationHasRollenError } from './errors/organisation-has-rollen.error.js';
import { OrganisationHasRollenerweiterungError } from './errors/organisation-has-rollenerweiterung.error.js';
import { OrganisationHasServiceProvidersError } from './errors/organisation-has-service-provider.error.js';
import { OrganisationHasZugehoerigeError } from './errors/organisation-has-zugehoerige.error.js';
import { OrganisationDeleteService } from './organisation-delete.service.js';

describe('OrganisationDeleteService', () => {
    let module: TestingModule;
    let organisationRepo: DeepMocked<OrganisationRepository>;
    let rolleRepo: DeepMocked<RolleRepo>;
    let personenkontextRepo: DeepMocked<DBiamPersonenkontextRepo>;
    let serviceProviderRepo: DeepMocked<ServiceProviderRepo>;
    let rollenerweiterungRepo: DeepMocked<RollenerweiterungRepo>;
    let organisationDeleteService: OrganisationDeleteService;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                OrganisationDeleteService,
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: ServiceProviderRepo,
                    useValue: createMock(ServiceProviderRepo),
                },
                {
                    provide: RollenerweiterungRepo,
                    useValue: createMock(RollenerweiterungRepo),
                },
            ],
        }).compile();

        organisationRepo = module.get(OrganisationRepository);
        rolleRepo = module.get(RolleRepo);
        personenkontextRepo = module.get(DBiamPersonenkontextRepo);
        serviceProviderRepo = module.get(ServiceProviderRepo);
        rollenerweiterungRepo = module.get(RollenerweiterungRepo);
        organisationDeleteService = module.get(OrganisationDeleteService);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('deleteOrganisation', () => {
        it('should call delete if no references are found', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const permissions: IPersonPermissions = createPersonPermissionsMock();

            organisationRepo.findBy.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[], 0]);

            rolleRepo.findBySchulstrukturknoten.mockResolvedValueOnce([]);

            personenkontextRepo.findBy.mockResolvedValueOnce([[], 0]);

            serviceProviderRepo.findBySchulstrukturknoten.mockResolvedValueOnce([]);

            rollenerweiterungRepo.existsByOrganisationId.mockResolvedValueOnce(Ok(false));

            await organisationDeleteService.deleteOrganisation(organisationId, permissions);

            expect(rollenerweiterungRepo.existsByOrganisationId).toHaveBeenCalledWith(organisationId, permissions);
            expect(organisationRepo.delete).toHaveBeenCalledOnce();
            expect(organisationRepo.delete).toHaveBeenCalledWith(organisationId);
        });

        it('should return OrganisationHasChildrenError if organisation has children', async () => {
            const organisationId: OrganisationID = faker.string.uuid();
            const permissions: IPersonPermissions = createPersonPermissionsMock();

            organisationRepo.findBy.mockResolvedValueOnce([
                [
                    DoFactory.createOrganisation(true, {
                        administriertVon: organisationId,
                    }),
                ],
                1,
            ]);

            const result: void | DomainError = await organisationDeleteService.deleteOrganisation(
                organisationId,
                permissions,
            );

            expect(result).toBeInstanceOf(OrganisationHasChildrenError);
            expect(rolleRepo.findBySchulstrukturknoten).not.toHaveBeenCalled();
            expect(personenkontextRepo.findBy).not.toHaveBeenCalled();
            expect(serviceProviderRepo.findBySchulstrukturknoten).not.toHaveBeenCalled();
            expect(rollenerweiterungRepo.existsByOrganisationId).not.toHaveBeenCalled();
            expect(organisationRepo.delete).not.toHaveBeenCalled();
        });

        it('should return OrganisationHasZugehoerigeError if organisation has zugehoerige organisations', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const permissions: IPersonPermissions = createPersonPermissionsMock();

            organisationRepo.findBy.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([
                [
                    DoFactory.createOrganisation(true, {
                        zugehoerigZu: organisationId,
                    }),
                ],
                1,
            ]);

            const result: void | DomainError = await organisationDeleteService.deleteOrganisation(
                organisationId,
                permissions,
            );

            expect(result).toBeInstanceOf(OrganisationHasZugehoerigeError);
            expect(rolleRepo.findBySchulstrukturknoten).not.toHaveBeenCalled();
            expect(personenkontextRepo.findBy).not.toHaveBeenCalled();
            expect(serviceProviderRepo.findBySchulstrukturknoten).not.toHaveBeenCalled();
            expect(rollenerweiterungRepo.existsByOrganisationId).not.toHaveBeenCalled();
            expect(organisationRepo.delete).not.toHaveBeenCalled();
        });

        it('should return OrganisationHasRollenError if Rollen are administered by organisation', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const permissions: IPersonPermissions = createPersonPermissionsMock();

            organisationRepo.findBy.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[], 0]);

            rolleRepo.findBySchulstrukturknoten.mockResolvedValueOnce([
                DoFactory.createRolle(true, {
                    administeredBySchulstrukturknoten: organisationId,
                }),
            ]);

            const result: void | DomainError = await organisationDeleteService.deleteOrganisation(
                organisationId,
                permissions,
            );

            expect(result).toBeInstanceOf(OrganisationHasRollenError);
            expect(personenkontextRepo.findBy).not.toHaveBeenCalled();
            expect(serviceProviderRepo.findBySchulstrukturknoten).not.toHaveBeenCalled();
            expect(rollenerweiterungRepo.existsByOrganisationId).not.toHaveBeenCalled();
            expect(organisationRepo.delete).not.toHaveBeenCalled();
        });

        it('should return OrganisationHasPersonenkontexteError if organisation has Personenkontexte', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const permissions: IPersonPermissions = createPersonPermissionsMock();

            organisationRepo.findBy.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[], 0]);

            rolleRepo.findBySchulstrukturknoten.mockResolvedValueOnce([]);

            personenkontextRepo.findBy.mockResolvedValueOnce([
                [
                    DoFactory.createPersonenkontext(true, {
                        organisationId,
                    }),
                ],
                1,
            ]);

            const result: void | DomainError = await organisationDeleteService.deleteOrganisation(
                organisationId,
                permissions,
            );

            expect(result).toBeInstanceOf(OrganisationHasPersonenkontexteError);
            expect(serviceProviderRepo.findBySchulstrukturknoten).not.toHaveBeenCalled();
            expect(rollenerweiterungRepo.existsByOrganisationId).not.toHaveBeenCalled();
            expect(organisationRepo.delete).not.toHaveBeenCalled();
        });

        it('should return OrganisationHasServiceProvidersError if organisation has ServiceProviders', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const permissions: IPersonPermissions = createPersonPermissionsMock();

            organisationRepo.findBy.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[], 0]);

            rolleRepo.findBySchulstrukturknoten.mockResolvedValueOnce([]);

            personenkontextRepo.findBy.mockResolvedValueOnce([[], 0]);

            serviceProviderRepo.findBySchulstrukturknoten.mockResolvedValueOnce([
                DoFactory.createServiceProvider(true, {
                    providedOnSchulstrukturknoten: organisationId,
                }),
            ]);

            const result: void | DomainError = await organisationDeleteService.deleteOrganisation(
                organisationId,
                permissions,
            );

            expect(result).toBeInstanceOf(OrganisationHasServiceProvidersError);
            expect(rollenerweiterungRepo.existsByOrganisationId).not.toHaveBeenCalled();
            expect(organisationRepo.delete).not.toHaveBeenCalled();
        });

        it('should return OrganisationHasRollenerweiterungError if organisation has Rollenerweiterungen', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const permissions: IPersonPermissions = createPersonPermissionsMock();

            organisationRepo.findBy.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[], 0]);

            rolleRepo.findBySchulstrukturknoten.mockResolvedValueOnce([]);

            personenkontextRepo.findBy.mockResolvedValueOnce([[], 0]);

            serviceProviderRepo.findBySchulstrukturknoten.mockResolvedValueOnce([]);

            rollenerweiterungRepo.existsByOrganisationId.mockResolvedValueOnce(Ok(true));

            const result: void | DomainError = await organisationDeleteService.deleteOrganisation(
                organisationId,
                permissions,
            );

            expect(result).toBeInstanceOf(OrganisationHasRollenerweiterungError);
            expect(rollenerweiterungRepo.existsByOrganisationId).toHaveBeenCalledWith(organisationId, permissions);
            expect(organisationRepo.delete).not.toHaveBeenCalled();
        });

        it('should return permission error if checking Rollenerweiterungen is not authorized', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const permissions: IPersonPermissions = createPersonPermissionsMock();

            const permissionError: MissingPermissionsError = new MissingPermissionsError('Not authorized');

            organisationRepo.findBy.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[], 0]);

            rolleRepo.findBySchulstrukturknoten.mockResolvedValueOnce([]);

            personenkontextRepo.findBy.mockResolvedValueOnce([[], 0]);

            serviceProviderRepo.findBySchulstrukturknoten.mockResolvedValueOnce([]);

            rollenerweiterungRepo.existsByOrganisationId.mockResolvedValueOnce(Err(permissionError));

            const result: void | DomainError = await organisationDeleteService.deleteOrganisation(
                organisationId,
                permissions,
            );

            expect(result).toBe(permissionError);
            expect(organisationRepo.delete).not.toHaveBeenCalled();
        });
    });
});
