import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { expectErrResult, expectOkResult } from '../../../../test/utils/test-types.js';
import {
    EventRoutingLegacyKafkaService,
    type PersistedWithEvents,
} from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { type DomainError } from '../../../shared/error/domain.error.js';
import { Ok } from '../../../shared/util/result.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { type Rollenerweiterung } from '../../rolle/domain/rollenerweiterung.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { ServiceProviderInternalRepo } from '../repo/service-provider.internal.repo.js';
import { ServiceProviderPropertyPermissions, ServiceProviderRepo } from '../repo/service-provider.repo.js';
import { InvalidLogoCombinationError } from './errors/invalid-logo-combination.error.js';
import { ServiceProviderModificationService } from './service-provider-modification.service.js';
import { ServiceProviderMerkmal } from './service-provider.enum.js';
import { type ServiceProvider } from './service-provider.js';

describe('ServiceProviderModificationService', () => {
    let sut: ServiceProviderModificationService;
    let serviceProviderRepoMock: DeepMocked<ServiceProviderRepo>;
    let serviceProviderInternalRepoMock: DeepMocked<ServiceProviderInternalRepo>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let rollenerweiterungRepoMock: DeepMocked<RollenerweiterungRepo>;
    let eventServiceMock: DeepMocked<EventRoutingLegacyKafkaService>;

    beforeEach(() => {
        serviceProviderRepoMock = createMock(ServiceProviderRepo);
        serviceProviderInternalRepoMock = createMock(ServiceProviderInternalRepo);
        rolleRepoMock = createMock(RolleRepo);
        rollenerweiterungRepoMock = createMock(RollenerweiterungRepo);
        eventServiceMock = createMock(EventRoutingLegacyKafkaService);
        eventServiceMock.persistAndPublish.mockImplementation(
            async <T>(persist: () => Promise<PersistedWithEvents<T>>) => {
                const outcome: PersistedWithEvents<T> = await persist();
                for (const pair of outcome.events) {
                    eventServiceMock.publish(pair.legacyEvent, pair.kafkaEvent);
                }
                return outcome.result;
            },
        );
        rollenerweiterungRepoMock.findByServiceProviderIdAndRollenarten.mockResolvedValue([]);

        sut = new ServiceProviderModificationService(
            serviceProviderRepoMock,
            serviceProviderInternalRepoMock,
            rolleRepoMock,
            rollenerweiterungRepoMock,
            eventServiceMock,
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

            rollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenartenForSPUpdate.mockResolvedValueOnce(
                deleteResult,
            );

            const result: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissions,
                serviceProviderToUpdate,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBe(permissionError);
            expect(rollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenartenForSPUpdate).toHaveBeenCalledWith(
                serviceProviderToUpdate.id,
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

            rollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenartenForSPUpdate.mockResolvedValueOnce(
                deleteResult,
            );

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
            expect(rollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenartenForSPUpdate).toHaveBeenCalledWith(
                serviceProviderToUpdate.id,
                expect.arrayContaining([RollenArt.LEHR]),
            );
            expect(serviceProviderInternalRepoMock.persistAndFlush).not.toHaveBeenCalled();
        });

        it('should publish RollenerweiterungDeletedEvent per affected tuple after successful deletion', async () => {
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

            const affected: Rollenerweiterung<true>[] = [
                DoFactory.createRollenerweiterung<true>(true, { serviceProviderId: existingProvider.id }),
                DoFactory.createRollenerweiterung<true>(true, { serviceProviderId: existingProvider.id }),
            ];

            serviceProviderRepoMock.getPermissionsForServiceProvider.mockResolvedValueOnce(
                Ok(ServiceProviderPropertyPermissions.ALL),
            );
            serviceProviderRepoMock.findById.mockResolvedValueOnce(existingProvider);
            rollenerweiterungRepoMock.findByServiceProviderIdAndRollenarten.mockResolvedValueOnce(affected);
            rollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenartenForSPUpdate.mockResolvedValueOnce(
                Ok(null),
            );

            const result: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissions,
                serviceProviderToUpdate,
            );

            expectOkResult(result);
            expect(eventServiceMock.publish).toHaveBeenCalledTimes(2);
            for (const rollenerweiterung of affected) {
                expect(eventServiceMock.publish).toHaveBeenCalledWith(
                    expect.objectContaining({
                        organisationId: rollenerweiterung.organisationId,
                        rolleId: rollenerweiterung.rolleId,
                        serviceProviderId: rollenerweiterung.serviceProviderId,
                    }),
                    expect.objectContaining({
                        organisationId: rollenerweiterung.organisationId,
                        rolleId: rollenerweiterung.rolleId,
                        serviceProviderId: rollenerweiterung.serviceProviderId,
                    }),
                );
            }
        });

        it('should not publish events when deletion fails', async () => {
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

            serviceProviderRepoMock.getPermissionsForServiceProvider.mockResolvedValueOnce(
                Ok(ServiceProviderPropertyPermissions.ALL),
            );
            serviceProviderRepoMock.findById.mockResolvedValueOnce(existingProvider);
            rollenerweiterungRepoMock.findByServiceProviderIdAndRollenarten.mockResolvedValueOnce([
                DoFactory.createRollenerweiterung<true>(true, { serviceProviderId: existingProvider.id }),
            ]);
            rollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenartenForSPUpdate.mockResolvedValueOnce({
                ok: false,
                error: new MissingPermissionsError('Not authorized'),
            });

            const result: Result<ServiceProvider<true>, DomainError> = await sut.update(
                permissions,
                serviceProviderToUpdate,
            );

            expectErrResult(result);
            expect(eventServiceMock.publish).not.toHaveBeenCalled();
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
