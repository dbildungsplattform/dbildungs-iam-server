import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { expectErrResult, expectOkResult } from '../../../../test/utils/test-types.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { Ok } from '../../../shared/util/result.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { ServiceProviderInternalRepo } from '../repo/service-provider.internal.repo.js';
import { ServiceProviderPropertyPermissions, ServiceProviderRepo } from '../repo/service-provider.repo.js';
import { InvalidLogoCombinationError } from './errors/invalid-logo-combination.error.js';
import { ServiceProviderModificationService } from './service-provider-modification.service.js';
import { ServiceProviderMerkmal } from './service-provider.enum.js';
import { ServiceProvider } from './service-provider.js';

describe('ServiceProviderModificationService', () => {
    let sut: ServiceProviderModificationService;
    let serviceProviderRepoMock: DeepMocked<ServiceProviderRepo>;
    let serviceProviderInternalRepoMock: DeepMocked<ServiceProviderInternalRepo>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let rollenerweiterungRepoMock: DeepMocked<RollenerweiterungRepo>;

    beforeEach(() => {
        serviceProviderRepoMock = createMock(ServiceProviderRepo);
        serviceProviderInternalRepoMock = createMock(ServiceProviderInternalRepo);
        rolleRepoMock = createMock(RolleRepo);
        rollenerweiterungRepoMock = createMock(RollenerweiterungRepo);

        sut = new ServiceProviderModificationService(
            serviceProviderRepoMock,
            serviceProviderInternalRepoMock,
            rolleRepoMock,
            rollenerweiterungRepoMock,
        );
    });

    describe('update', () => {
        it('should return InvalidLogoCombinationError when applying frozen properties fails', async () => {
            const permissions: ReturnType<typeof createPersonPermissionsMock> = createPersonPermissionsMock();

            const existingProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                requires2fa: true,
            });

            const serviceProviderToUpdate: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                id: existingProvider.id,
                logo: Buffer.from('invalid-logo-state'),
                logoMimeType: undefined,
            });

            serviceProviderRepoMock.getPermissionsForServiceProvider.mockResolvedValueOnce(
                Ok(ServiceProviderPropertyPermissions.ALL),
            );
            serviceProviderRepoMock.findById.mockResolvedValueOnce(existingProvider);

            const result: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissions,
                serviceProviderToUpdate,
            );

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(InvalidLogoCombinationError);
            expect(serviceProviderInternalRepoMock.persistAndFlush).not.toHaveBeenCalled();
        });

        it('should return deletion error when removing VERFUEGBAR_FUER_ROLLENERWEITERUNG fails', async () => {
            const permissions: ReturnType<typeof createPersonPermissionsMock> = createPersonPermissionsMock();

            const existingProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });

            const serviceProviderToUpdate: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                id: existingProvider.id,
                name: existingProvider.name,
                requires2fa: existingProvider.requires2fa,
                merkmale: [],
                rollenartenWhitelist: existingProvider.rollenartenWhitelist,
            });

            const permissionError: MissingPermissionsError = new MissingPermissionsError('Not authorized');

            const deleteResult: Result<null, DomainError | MissingPermissionsError> = {
                ok: false,
                error: permissionError,
            };

            serviceProviderRepoMock.getPermissionsForServiceProvider.mockResolvedValueOnce(
                Ok(ServiceProviderPropertyPermissions.ALL),
            );

            serviceProviderRepoMock.findById.mockResolvedValueOnce(existingProvider);

            rollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenarten.mockResolvedValueOnce(deleteResult);

            const result: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissions,
                serviceProviderToUpdate,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBe(permissionError);
            expect(rollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenarten).toHaveBeenCalledWith(
                serviceProviderToUpdate.id,
                permissions,
            );
            expect(serviceProviderInternalRepoMock.persistAndFlush).not.toHaveBeenCalled();
        });

        it('should return deletion error when cleanup after changing rollenartenWhitelist fails', async () => {
            const permissions: ReturnType<typeof createPersonPermissionsMock> = createPersonPermissionsMock();

            const existingProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [RollenArt.LEHR],
            });

            const serviceProviderToUpdate: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                id: existingProvider.id,
                name: existingProvider.name,
                requires2fa: existingProvider.requires2fa,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [RollenArt.SYSADMIN],
            });

            const permissionError: MissingPermissionsError = new MissingPermissionsError('Not authorized');

            const deleteResult: Result<null, DomainError | MissingPermissionsError> = {
                ok: false,
                error: permissionError,
            };

            serviceProviderRepoMock.getPermissionsForServiceProvider.mockResolvedValueOnce(
                Ok(ServiceProviderPropertyPermissions.ALL),
            );

            serviceProviderRepoMock.findById.mockResolvedValueOnce(existingProvider);

            rolleRepoMock.existsForServiceProviderId.mockResolvedValueOnce(false);

            rollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenarten.mockResolvedValueOnce(deleteResult);

            const result: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissions,
                serviceProviderToUpdate,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBe(permissionError);
            expect(rolleRepoMock.existsForServiceProviderId).toHaveBeenCalledWith(
                serviceProviderToUpdate.id,
                expect.arrayContaining([RollenArt.LEHR]),
            );

            expect(rollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenarten).toHaveBeenCalledWith(
                serviceProviderToUpdate.id,
                permissions,
                expect.arrayContaining([RollenArt.LEHR]),
            );
            expect(serviceProviderInternalRepoMock.persistAndFlush).not.toHaveBeenCalled();
        });
    });

    describe('deleteByIdAuthorized', () => {
        it('should succeed if no rollenerweiterungen are found', async () => {
            const permissions: ReturnType<typeof createPersonPermissionsMock> = createPersonPermissionsMock();

            const existingProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                requires2fa: true,
            });
            serviceProviderRepoMock.findById.mockResolvedValueOnce(existingProvider);
            rolleRepoMock.existsForServiceProviderId.mockResolvedValueOnce(false);
            rollenerweiterungRepoMock.countByServiceProviderIds.mockResolvedValueOnce({});
            serviceProviderRepoMock.deleteByIdAuthorized.mockResolvedValueOnce(Ok());

            const result: Result<void, DomainError> = await sut.deleteByIdAuthorized(permissions, existingProvider.id);

            expectOkResult(result);
        });
    });
});
