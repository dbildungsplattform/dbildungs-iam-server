import { describe, it, expect } from 'vitest';
import { EscalatedPersonPermissionsFactory } from './escalated-person-permissions.factory.js';
import { createMock, type DeepMocked } from '../../../test/utils/createMock.js';
import { ClassLogger } from '../../core/logging/class-logger.js';
import { DBiamPersonenkontextRepo } from '../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { OrganisationRepository } from '../organisation/persistence/organisation.repository.js';
import { EscalatedPersonPermissions } from './escalated-person-permissions.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../rolle/domain/systemrecht.js';
import { createPersonPermissionsMock } from '../../../test/utils/index.js';
import { type PersonPermissions } from '../authentication/domain/person-permissions.js';
import { type IPersonPermissions } from '../../shared/permissions/person-permissions.interface.js';

describe('EscalatedPersonPermissionsFactory', () => {
    let sut: EscalatedPersonPermissionsFactory;
    const orgaRepoMock: DeepMocked<OrganisationRepository> = createMock(OrganisationRepository),
        personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo> = createMock(DBiamPersonenkontextRepo),
        classLoggerMock: DeepMocked<ClassLogger> = createMock(ClassLogger);

    beforeEach(() => {
        sut = new EscalatedPersonPermissionsFactory(orgaRepoMock, personenkontextRepoMock, classLoggerMock, Object);
        vi.resetAllMocks();
    });

    describe('createNew', () => {
        it('should create new EscalatedPersonPermissions with PersonId ', async () => {
            const permissions: EscalatedPersonPermissions = sut.createNew(
                [{ orgaId: '1234', systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN] }],
                'personId',
            );
            orgaRepoMock.findParentOrgasForIds.mockResolvedValueOnce([]);

            await expect(
                permissions.hasSystemrechtAtOrganisation('1234', RollenSystemRecht.PERSONEN_VERWALTEN),
            ).resolves.toBe(true);
        });

        it('should create new EscalatedPersonPermissions without PersonId ', async () => {
            const permissions: EscalatedPersonPermissions = sut.createNew([
                { orgaId: '1234', systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN] },
            ]);
            orgaRepoMock.findParentOrgasForIds.mockResolvedValueOnce([]);

            await expect(
                permissions.hasSystemrechtAtOrganisation('1234', RollenSystemRecht.PERSONEN_VERWALTEN),
            ).resolves.toBe(true);
        });
    });

    describe('fromPermissions', () => {
        it('should create new EscalatedPersonPermissions from PersonPermissions', async () => {
            const personPermissionsMock: PersonPermissions = createPersonPermissionsMock();
            orgaRepoMock.findParentOrgasForIds.mockResolvedValueOnce([]);

            const escalatedPermissions: EscalatedPersonPermissions = await sut.fromPermissions(personPermissionsMock, [
                { orgaId: '1234', systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN] },
            ]);

            expect(escalatedPermissions).toBeInstanceOf(EscalatedPersonPermissions);
            await expect(
                escalatedPermissions.hasSystemrechtAtOrganisation('1234', RollenSystemRecht.PERSONEN_VERWALTEN),
            ).resolves.toBe(true);
        });

        it('should create new EscalatedPersonPermissions from EscalatedPermissions', async () => {
            const previousEscalatedPermissionsMock: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'test' },
                [{ orgaId: '1234', systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN] }],
                orgaRepoMock,
                personenkontextRepoMock,
                classLoggerMock,
            );
            orgaRepoMock.findParentOrgasForIds.mockResolvedValueOnce([]);

            const escalatedPermissions: EscalatedPersonPermissions = await sut.fromPermissions(
                previousEscalatedPermissionsMock,
                [{ orgaId: '1234', systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN] }],
            );

            expect(escalatedPermissions).toBeInstanceOf(EscalatedPersonPermissions);
            await expect(
                escalatedPermissions.hasSystemrechtAtOrganisation('1234', RollenSystemRecht.PERSONEN_VERWALTEN),
            ).resolves.toBe(true);
        });
        it('should throw if permissions are neither PersonPermissions nor EscalatedPersonPermissions', async () => {
            await expect(
                sut.fromPermissions({} as unknown as IPersonPermissions, [
                    { orgaId: '1234', systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN] },
                ]),
            ).rejects.toThrow('Provided permissions are neither PersonPermissions nor EscalatedPersonPermissions');
        });
    });
});
