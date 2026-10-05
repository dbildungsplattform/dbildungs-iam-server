import { Mock, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_PIPE } from '@nestjs/core';
import { createPersonPermissionsMock, LoggingTestModule } from '../../../../test/utils/index.js';
import { GlobalValidationPipe } from '../../../shared/validation/global-validation.pipe.js';
import { RollenerweiterungController } from './rollenerweiterung.controller.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { ApplyRollenerweiterungForSPPathParams } from './apply-rollenerweiterung-for-sp-changes.path.params.js';
import { ApplyRollenerweiterungBodyParams } from './apply-rollenerweiterung.body.params.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { faker } from '@faker-js/faker';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { ApplyRollenerweiterungForAngebotService } from '../domain/apply-rollenerweiterungen-for-angebot-service.js';
import { ApplyRollenerweiterungError } from './apply-rollenerweiterung.error.js';
import { DomainError, MissingPermissionsError } from '../../../shared/error/index.js';
import { MissingMerkmalVerfuegbarFuerRollenerweiterungError } from '../domain/missing-merkmal-verfuegbar-fuer-rollenerweiterung.error.js';

describe('RollenerweiterungController', () => {
    let controller: RollenerweiterungController;
    let applyRollenerweiterungServiceMock: DeepMocked<ApplyRollenerweiterungForAngebotService>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                {
                    provide: ClassLogger,
                    useValue: createMock<ClassLogger>(ClassLogger),
                },
                {
                    provide: ApplyRollenerweiterungForAngebotService,
                    useValue: createMock<ApplyRollenerweiterungForAngebotService>(
                        ApplyRollenerweiterungForAngebotService,
                    ),
                },
                RollenerweiterungController,
            ],
        }).compile();

        controller = module.get(RollenerweiterungController);
        applyRollenerweiterungServiceMock = module.get(ApplyRollenerweiterungForAngebotService);
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('applyRollenerweiterungChanges', () => {
        it('should apply Rollenerweiterungen', async () => {
            const params: ApplyRollenerweiterungForSPPathParams = {
                angebotId: faker.string.uuid(),
                organisationId: faker.string.uuid(),
            };
            const body: ApplyRollenerweiterungBodyParams = {
                addErweiterungenForRolleIds: [],
                removeErweiterungenForRolleIds: [],
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            applyRollenerweiterungServiceMock.applyRollenerweiterungChangesForAngebot.mockResolvedValueOnce({
                ok: true,
                value: null,
            });

            await expect(controller.applyRollenerweiterungChanges(params, body, permissions)).resolves.toBeUndefined();
        });

        it('should log error with failed and successful rollen ids when ApplyRollenerweiterungWorkflowAggregate returns error', async () => {
            const params: ApplyRollenerweiterungForSPPathParams = {
                angebotId: faker.string.uuid(),
                organisationId: faker.string.uuid(),
            };
            const body: ApplyRollenerweiterungBodyParams = {
                addErweiterungenForRolleIds: ['rollenId1', 'rollenId2', 'rollenId3'],
                removeErweiterungenForRolleIds: ['rollenId4'],
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const errorRollenId2: { id: string; error: DomainError } = {
                id: 'rollenId2',
                error: new EntityNotFoundError('Rolle', 'rollenId2'),
            };
            const errorRollenId4: { id: string; error: DomainError } = {
                id: 'rollenId4',
                error: new EntityNotFoundError('Rolle', 'rollenId4'),
            };
            const loggerInfoSpy: Mock<(message: string, trace?: unknown) => void> = vi.spyOn(
                controller['logger'],
                'info',
            );
            const loggerErrorSpy: Mock<(message: string, trace?: unknown) => void> = vi.spyOn(
                controller['logger'],
                'error',
            );

            applyRollenerweiterungServiceMock.applyRollenerweiterungChangesForAngebot.mockResolvedValueOnce({
                ok: false,
                error: new ApplyRollenerweiterungError([
                    { id: 'rollenId2', error: errorRollenId2 as unknown as DomainError },
                    { id: 'rollenId4', error: errorRollenId4 as unknown as DomainError },
                ]),
            });

            await expect(controller.applyRollenerweiterungChanges(params, body, permissions)).rejects.toThrow();

            expect(loggerInfoSpy).toHaveBeenCalledWith(
                `applyRollenerweiterungChanges called by ${permissions.personFields.username} - ${permissions.personFields.id} for angebotId ${params.angebotId} and organisationId ${params.organisationId} with 3 x ADD (rollenId1, rollenId2, rollenId3) and 1 x REMOVE (rollenId4).`,
            );

            expect(loggerErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining(`success for rollen: rollenId1, rollenId3`),
            );
        });

        it('should throw if ApplyRollenerweiterungService returns ApplyRollenerweiterungRolesError error', async () => {
            const params: ApplyRollenerweiterungForSPPathParams = {
                angebotId: faker.string.uuid(),
                organisationId: faker.string.uuid(),
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const body: ApplyRollenerweiterungBodyParams = {
                addErweiterungenForRolleIds: [],
                removeErweiterungenForRolleIds: [],
            };
            applyRollenerweiterungServiceMock.applyRollenerweiterungChangesForAngebot.mockResolvedValueOnce({
                ok: false,
                error: new ApplyRollenerweiterungError([]),
            });

            await expect(controller.applyRollenerweiterungChanges(params, body, permissions)).rejects.toThrow(
                ApplyRollenerweiterungError,
            );
        });

        it('should throw if ApplyRollenerweiterungService returns EntityNotFoundError error', async () => {
            const params: ApplyRollenerweiterungForSPPathParams = {
                angebotId: faker.string.uuid(),
                organisationId: faker.string.uuid(),
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const body: ApplyRollenerweiterungBodyParams = {
                addErweiterungenForRolleIds: [],
                removeErweiterungenForRolleIds: [],
            };
            applyRollenerweiterungServiceMock.applyRollenerweiterungChangesForAngebot.mockResolvedValueOnce({
                ok: false,
                error: new EntityNotFoundError(),
            });

            await expect(controller.applyRollenerweiterungChanges(params, body, permissions)).rejects.toBeInstanceOf(
                EntityNotFoundError,
            );
        });

        it('should throw if ApplyRollenerweiterungService returns MissingPermissionsError error', async () => {
            const params: ApplyRollenerweiterungForSPPathParams = {
                angebotId: faker.string.uuid(),
                organisationId: faker.string.uuid(),
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const body: ApplyRollenerweiterungBodyParams = {
                addErweiterungenForRolleIds: [],
                removeErweiterungenForRolleIds: [],
            };
            applyRollenerweiterungServiceMock.applyRollenerweiterungChangesForAngebot.mockResolvedValueOnce({
                ok: false,
                error: new MissingPermissionsError(''),
            });

            await expect(controller.applyRollenerweiterungChanges(params, body, permissions)).rejects.toBeInstanceOf(
                MissingPermissionsError,
            );
        });

        it('should throw if ApplyRollenerweiterungService returns MissingMerkmalVerfuegbarFuerRollenerweiterungError error', async () => {
            const params: ApplyRollenerweiterungForSPPathParams = {
                angebotId: faker.string.uuid(),
                organisationId: faker.string.uuid(),
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const body: ApplyRollenerweiterungBodyParams = {
                addErweiterungenForRolleIds: [],
                removeErweiterungenForRolleIds: [],
            };
            applyRollenerweiterungServiceMock.applyRollenerweiterungChangesForAngebot.mockResolvedValueOnce({
                ok: false,
                error: new MissingMerkmalVerfuegbarFuerRollenerweiterungError(),
            });

            await expect(controller.applyRollenerweiterungChanges(params, body, permissions)).rejects.toThrow(
                MissingMerkmalVerfuegbarFuerRollenerweiterungError,
            );
        });

        it('should throw if ApplyRollenerweiterungService returns unknown error', async () => {
            const params: ApplyRollenerweiterungForSPPathParams = {
                angebotId: faker.string.uuid(),
                organisationId: faker.string.uuid(),
            };
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const body: ApplyRollenerweiterungBodyParams = {
                addErweiterungenForRolleIds: [],
                removeErweiterungenForRolleIds: [],
            };
            applyRollenerweiterungServiceMock.applyRollenerweiterungChangesForAngebot.mockResolvedValueOnce({
                ok: false,
                error: new Error() as unknown as MissingMerkmalVerfuegbarFuerRollenerweiterungError,
            });

            await expect(controller.applyRollenerweiterungChanges(params, body, permissions)).rejects.toThrow();
        });
    });
});
