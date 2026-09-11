import { faker } from '@faker-js/faker';
import { APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { LoggingTestModule } from '../../../../test/utils/logging-test.module.js';
import { DEFAULT_TIMEOUT_FOR_TESTCONTAINERS } from '../../../../test/utils/timeouts.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { Paged } from '../../../shared/paging/paged.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { GlobalValidationPipe } from '../../../shared/validation/global-validation.pipe.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationService } from '../../organisation/domain/organisation.service.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { ApplyRollenerweiterungForRolleService } from '../domain/apply-rollenerweiterungen-for-rolle-service.js';
import { NameForRolleWithTrailingSpaceError } from '../domain/name-with-trailing-space.error.js';
import { RolleFindService } from '../domain/rolle-find.service.js';
import { RollenArt, RollenMerkmal } from '../domain/rolle.enums.js';
import { RolleFactory } from '../domain/rolle.factory.js';
import { Rolle } from '../domain/rolle.js';
import { RollenerweiterungFactory } from '../domain/rollenerweiterung.factory.js';
import { RollenSystemRechtEnum } from '../domain/systemrecht.js';
import { RolleRepo } from '../repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../repo/rollenerweiterung.repo.js';
import { CreateRolleBodyParams } from './create-rolle.body.params.js';
import { CreateRollenerweiterungBodyParams } from './create-rollenerweiterung.body.params.js';
import { FindRolleByIdParams } from './find-rolle-by-id.params.js';
import { FindRolleForPersonAdministrationQueryParams } from './find-rolle-for-person-administration-query.param.js';
import { RolleController } from './rolle.controller.js';
import { RolleResponse } from './rolle.response.js';
import { RollenerweiterungResponse } from './rollenerweiterung.response.js';

describe('Rolle API with mocked ServiceProviderRepo', () => {
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let rolleController: RolleController;
    let organisationServiceMock: DeepMocked<OrganisationService>;
    let rolleFindServiceMock: DeepMocked<RolleFindService>;
    let rollenerweiterungRepoMock: DeepMocked<RollenerweiterungRepo>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: RolleFindService,
                    useValue: createMock(RolleFindService),
                },
                {
                    provide: OrganisationService,
                    useValue: createMock(OrganisationService),
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
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: OrganisationService,
                    useValue: createMock(OrganisationService),
                },
                {
                    provide: RollenerweiterungRepo,
                    useValue: createMock(RollenerweiterungRepo),
                },
                {
                    provide: ApplyRollenerweiterungForRolleService,
                    useValue: createMock(ApplyRollenerweiterungForRolleService),
                },
                RolleController,
                RolleFactory,
                RollenerweiterungFactory,
            ],
        }).compile();

        rolleRepoMock = module.get(RolleRepo);
        rolleController = module.get(RolleController);
        organisationServiceMock = module.get(OrganisationService);
        rollenerweiterungRepoMock = module.get(RollenerweiterungRepo);
        rolleFindServiceMock = module.get(RolleFindService);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('/POST rolle mocked Rolle-repo', () => {
        describe('createRolle', () => {
            const permissionsMock: IPersonPermissions = createPersonPermissionsMock();
            it('should throw an HTTP exception when rolleFactory.createNew returns DomainError', async () => {
                const createRolleParams: CreateRolleBodyParams = {
                    name: ' SuS',
                    administeredBySchulstrukturknoten: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT],
                    systemrechte: [RollenSystemRechtEnum.KLASSEN_VERWALTEN],
                    serviceProviderIds: [],
                };

                const organisation: Organisation<true> = DoFactory.createOrganisation(true);
                organisationServiceMock.findOrganisationById.mockResolvedValueOnce({
                    ok: true,
                    value: organisation,
                });

                await expect(rolleController.createRolle(createRolleParams, permissionsMock)).rejects.toThrow(
                    NameForRolleWithTrailingSpaceError,
                );
            });
        });
    });

    describe('POST rolle/erweiterung', () => {
        describe('createRollenerweiterung', () => {
            let createRollenerweiterungParams: CreateRollenerweiterungBodyParams;
            let permissions: IPersonPermissions;
            beforeEach(() => {
                createRollenerweiterungParams = new CreateRollenerweiterungBodyParams();
                Object.assign(createRollenerweiterungParams, {
                    organisationId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    serviceProviderId: faker.string.uuid(),
                });
                permissions = createPersonPermissionsMock();
            });

            it('should return the response', async () => {
                rollenerweiterungRepoMock.createAuthorized.mockResolvedValueOnce({
                    ok: true,
                    value: DoFactory.createRollenerweiterung<true>(true, createRollenerweiterungParams),
                });
                const result: RollenerweiterungResponse = await rolleController.createRollenerweiterung(
                    createRollenerweiterungParams,
                    permissions,
                );
                expect(result).toBeInstanceOf(RollenerweiterungResponse);
                expect(result).toEqual(
                    expect.objectContaining({
                        organisationId: createRollenerweiterungParams.organisationId,
                        rolleId: createRollenerweiterungParams.rolleId,
                        serviceProviderId: createRollenerweiterungParams.serviceProviderId,
                    }),
                );
            });

            it('should throw an HTTP exception when rollenerweiterung can not be created', async () => {
                rollenerweiterungRepoMock.createAuthorized.mockResolvedValueOnce({
                    ok: false,
                    error: new MissingPermissionsError('dummy error'),
                });
                await expect(
                    rolleController.createRollenerweiterung(createRollenerweiterungParams, permissions),
                ).rejects.toThrow(MissingPermissionsError);
            });
        });
    });

    describe('GET rolle/for-person-administration', () => {
        it('should delegate to RolleFindService and wrap the paged response', async () => {
            const permissions: IPersonPermissions = createPersonPermissionsMock();
            const queryParams: FindRolleForPersonAdministrationQueryParams = {
                searchStr: faker.string.alpha({ length: 10 }),
                limit: 25,
                offset: 0,
                organisationIds: [faker.string.uuid()],
            };
            const foundRollen: Rolle<true>[] = [DoFactory.createRolle(true)];

            rolleFindServiceMock.findRollenAvailableForPersonAdministration = vi
                .fn()
                .mockResolvedValueOnce([foundRollen, foundRollen.length]);

            const result: Paged<RolleResponse> = await rolleController.findRollenAvailableForPersonAdministration(
                queryParams,
                permissions,
            );

            expect(rolleFindServiceMock.findRollenAvailableForPersonAdministration).toHaveBeenCalledWith(
                expect.objectContaining({
                    permissions,
                    searchStr: queryParams.searchStr,
                    limit: queryParams.limit,
                    offset: queryParams.offset,
                    organisationIds: queryParams.organisationIds,
                }),
            );
            expect(result).toEqual(
                expect.objectContaining({
                    items: expect.arrayContaining([
                        expect.objectContaining({ id: foundRollen[0]!.id }),
                    ]) as Array<RolleResponse>,
                    total: foundRollen.length,
                    offset: 0,
                    limit: 25,
                }),
            );
        });

        it('should return limit and offset from query params', async () => {
            const permissions: IPersonPermissions = createPersonPermissionsMock();
            const queryParams: FindRolleForPersonAdministrationQueryParams = {
                searchStr: faker.string.alpha({ length: 8 }),
                limit: 7,
                offset: 13,
                organisationIds: [faker.string.uuid()],
            };
            const foundRollen: Rolle<true>[] = [DoFactory.createRolle(true)];

            rolleFindServiceMock.findRollenAvailableForPersonAdministration = vi
                .fn()
                .mockResolvedValueOnce([foundRollen, 42]);

            const result: Paged<RolleResponse> = await rolleController.findRollenAvailableForPersonAdministration(
                queryParams,
                permissions,
            );

            expect(result.limit).toBe(queryParams.limit);
            expect(result.offset).toBe(queryParams.offset);
            expect(result.total).toBe(42);
        });

        it('should return default paging values when limit and offset are not provided', async () => {
            const permissions: IPersonPermissions = createPersonPermissionsMock();
            const queryParams: FindRolleForPersonAdministrationQueryParams = {
                searchStr: faker.string.alpha({ length: 8 }),
                organisationIds: [faker.string.uuid()],
            };
            const foundRollen: Rolle<true>[] = [DoFactory.createRolle(true), DoFactory.createRolle(true)];

            rolleFindServiceMock.findRollenAvailableForPersonAdministration = vi
                .fn()
                .mockResolvedValueOnce([foundRollen, 100]);

            const result: Paged<RolleResponse> = await rolleController.findRollenAvailableForPersonAdministration(
                queryParams,
                permissions,
            );

            expect(result.offset).toBe(0);
            expect(result.limit).toBe(100);
            expect(result.total).toBe(100);
        });
    });

    describe('DELETE rolle/:rolleId', () => {
        it('should delegate deletion to RolleRepo', async () => {
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const permissions: IPersonPermissions = createPersonPermissionsMock();
            const params: FindRolleByIdParams = { rolleId: rolle.id };

            rolleRepoMock.findById.mockResolvedValueOnce(rolle);
            rolleRepoMock.deleteAuthorized.mockResolvedValueOnce(undefined);

            await expect(rolleController.deleteRolle(params, permissions)).resolves.toBeUndefined();
            expect(rolleRepoMock.deleteAuthorized).toHaveBeenCalledWith(rolle.id, permissions);
        });

        it('should throw if RolleRepo returns a domain error', async () => {
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const permissions: IPersonPermissions = createPersonPermissionsMock();
            const params: FindRolleByIdParams = { rolleId: rolle.id };
            const error: MissingPermissionsError = new MissingPermissionsError('dummy error');

            rolleRepoMock.findById.mockResolvedValueOnce(rolle);
            rolleRepoMock.deleteAuthorized.mockResolvedValueOnce(error);

            await expect(rolleController.deleteRolle(params, permissions)).rejects.toThrow(MissingPermissionsError);
        });
    });
});
