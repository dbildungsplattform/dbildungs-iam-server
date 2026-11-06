import { Test, type TestingModule } from '@nestjs/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClassLogger } from '../../../../../core/logging/class-logger.js';
import { SchulconnexPushError } from '../../../../../shared/error/index.js';
import { EmailMicroserviceAddressChangedEvent } from '../../../../../shared/events/email-microservice/email-microservice-address-changed.event.js';
import { LocksForPersonChangedEvent } from '../../../../../shared/events/locks-for-person-changed.event.js';
import { type PersonID } from '../../../../../shared/types/aggregate-ids.types.js';
import { Err, Ok } from '../../../../../shared/util/result.js';
import { EmailResolverService } from '../../../../email-microservice/domain/email-resolver.service.js';
import { UserLock } from '../../../../keycloak-administration/domain/user-lock.js';
import { UserLockRepository } from '../../../../keycloak-administration/repository/user-lock.repository.js';
import { type PersonEmailResponse } from '../../../../person/api/person-email-response.js';
import { PersonLockOccasion } from '../../../../person/domain/person.enums.js';
import {
    DBiamPersonenkontextRepo,
    type KontextWithOrgaAndRolle,
} from '../../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { SchulconnexPushRegistry } from '../../domain/schulconnex-push-registry.js';
import { SchulconnexPushRegistryRepo } from '../../persistence/schulconnex-push-registry.repo.js';
import { SchulconnexPushAdapter } from '../domain/schulconnex-push.adapter.js';
import { SchulconnexPushHandler } from './schulconnex-push.handler.js';

describe('SchulconnexPushHandler', () => {
    let module: TestingModule;
    let sut: SchulconnexPushHandler;

    let loggerMock: {
        info: ReturnType<typeof vi.fn>;
        logUnknownAsError: ReturnType<typeof vi.fn>;
    };
    let pushAdapterMock: {
        upsertPersonenkontext: ReturnType<typeof vi.fn>;
    };
    let pushRegistryRepoMock: {
        findAll: ReturnType<typeof vi.fn>;
    };
    let personenkontextRepoMock: {
        findByPersonAndServiceProviderWithOrgaAndRolle: ReturnType<typeof vi.fn>;
    };
    let userLockRepoMock: {
        findByPersonId: ReturnType<typeof vi.fn>;
    };
    let emailResolverServiceMock: {
        findEmailsBySpshPersons: ReturnType<typeof vi.fn>;
    };

    const personId: PersonID = 'person-id';
    const registry: SchulconnexPushRegistry<true> = SchulconnexPushRegistry.construct(
        'registry-id',
        new Date(),
        new Date(),
        'service-provider-id',
        'https://schulconnex.example.org',
    );
    const kontext: KontextWithOrgaAndRolle = {
        personenkontext: {
            id: 'kontext-id',
            personId,
        },
    } as KontextWithOrgaAndRolle;

    beforeAll(async () => {
        loggerMock = {
            info: vi.fn(),
            logUnknownAsError: vi.fn(),
        };
        pushAdapterMock = {
            upsertPersonenkontext: vi.fn(),
        };
        pushRegistryRepoMock = {
            findAll: vi.fn(),
        };
        personenkontextRepoMock = {
            findByPersonAndServiceProviderWithOrgaAndRolle: vi.fn(),
        };
        userLockRepoMock = {
            findByPersonId: vi.fn(),
        };
        emailResolverServiceMock = {
            findEmailsBySpshPersons: vi.fn(),
        };

        module = await Test.createTestingModule({
            providers: [
                SchulconnexPushHandler,
                {
                    provide: ClassLogger,
                    useValue: loggerMock,
                },
                {
                    provide: SchulconnexPushAdapter,
                    useValue: pushAdapterMock,
                },
                {
                    provide: SchulconnexPushRegistryRepo,
                    useValue: pushRegistryRepoMock,
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: personenkontextRepoMock,
                },
                {
                    provide: UserLockRepository,
                    useValue: userLockRepoMock,
                },
                {
                    provide: EmailResolverService,
                    useValue: emailResolverServiceMock,
                },
            ],
        }).compile();

        sut = module.get(SchulconnexPushHandler);
    });

    beforeEach(() => {
        vi.clearAllMocks();

        pushRegistryRepoMock.findAll.mockResolvedValue([registry]);
        personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle.mockResolvedValue([kontext]);
        userLockRepoMock.findByPersonId.mockResolvedValue([]);
        emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValue(Ok(new Map()));
        pushAdapterMock.upsertPersonenkontext.mockResolvedValue(Ok());
    });

    describe('handleEmailAddressChanged', () => {
        it('should update all relevant personenkontexte', async () => {
            const email: PersonEmailResponse = {
                address: 'new@example.org',
            } as unknown as PersonEmailResponse;

            emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValue(Ok(new Map([[personId, email]])));

            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                personId,
                'new@example.org',
                undefined,
                'old@example.org',
                undefined,
            );

            await sut.handleEmailAddressChanged(event);

            expect(pushRegistryRepoMock.findAll).toHaveBeenCalledOnce();
            expect(userLockRepoMock.findByPersonId).toHaveBeenCalledWith(personId);
            expect(emailResolverServiceMock.findEmailsBySpshPersons).toHaveBeenCalledWith([personId]);
            expect(personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle).toHaveBeenCalledWith(
                personId,
                registry.serviceProviderId,
            );
            expect(pushAdapterMock.upsertPersonenkontext).toHaveBeenCalledWith(registry, kontext, [], email);
        });

        it('should push no email when person has no current email', async () => {
            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                personId,
                undefined,
                undefined,
                'old@example.org',
                undefined,
            );

            emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValue(Ok(new Map()));

            await sut.handleEmailAddressChanged(event);

            expect(pushAdapterMock.upsertPersonenkontext).toHaveBeenCalledWith(registry, kontext, [], undefined);
        });

        it('should not push when no relevant personenkontexte exist', async () => {
            personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle.mockResolvedValue([]);

            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                personId,
                'new@example.org',
                undefined,
                undefined,
                undefined,
            );

            await sut.handleEmailAddressChanged(event);

            expect(pushAdapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
        });

        it('should use current email instead of email from the event', async () => {
            const email: PersonEmailResponse = {
                address: 'current@example.org',
            } as unknown as PersonEmailResponse;

            emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValue(Ok(new Map([[personId, email]])));

            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                personId,
                'event@example.org',
                undefined,
                'old@example.org',
                undefined,
            );

            await sut.handleEmailAddressChanged(event);

            expect(pushAdapterMock.upsertPersonenkontext).toHaveBeenCalledWith(registry, kontext, [], email);
        });
    });

    describe('handleLocksForPersonChanged', () => {
        it('should update all relevant personenkontexte with current locks', async () => {
            const currentLocks: UserLock[] = [
                UserLock.construct(personId, 'admin-id', new Date(), PersonLockOccasion.MANUELL_GESPERRT, new Date()),
            ];

            userLockRepoMock.findByPersonId.mockResolvedValue(currentLocks);

            const event: LocksForPersonChangedEvent = new LocksForPersonChangedEvent(personId, [], []);

            await sut.handleLocksForPersonChanged(event);

            expect(userLockRepoMock.findByPersonId).toHaveBeenCalledWith(personId);
            expect(pushAdapterMock.upsertPersonenkontext).toHaveBeenCalledWith(
                registry,
                kontext,
                currentLocks,
                undefined,
            );
        });

        it('should use current locks instead of locks from the event', async () => {
            const currentLocks: UserLock[] = [
                UserLock.construct(personId, 'admin-id', new Date(), PersonLockOccasion.MANUELL_GESPERRT, new Date()),
            ];

            userLockRepoMock.findByPersonId.mockResolvedValue(currentLocks);

            const event: LocksForPersonChangedEvent = new LocksForPersonChangedEvent(
                personId,
                [
                    {
                        locked_until: new Date(),
                        locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
                    },
                ],
                [
                    {
                        locked_until: undefined,
                        locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
                    },
                ],
            );

            await sut.handleLocksForPersonChanged(event);

            expect(pushAdapterMock.upsertPersonenkontext).toHaveBeenCalledWith(
                registry,
                kontext,
                currentLocks,
                undefined,
            );
        });

        it('should not push when no relevant personenkontexte exist', async () => {
            personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle.mockResolvedValue([]);

            const event: LocksForPersonChangedEvent = new LocksForPersonChangedEvent(personId, [], []);

            await sut.handleLocksForPersonChanged(event);

            expect(pushAdapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
        });
    });

    describe('multiple registries', () => {
        it('should update relevant personenkontexte for every registry', async () => {
            const secondRegistry: SchulconnexPushRegistry<true> = SchulconnexPushRegistry.construct(
                'registry-id-2',
                new Date(),
                new Date(),
                'service-provider-id-2',
                'https://schulconnex-2.example.org',
            );

            const secondKontext: KontextWithOrgaAndRolle = {
                personenkontext: {
                    id: 'kontext-id-2',
                    personId,
                },
            } as KontextWithOrgaAndRolle;

            pushRegistryRepoMock.findAll.mockResolvedValue([registry, secondRegistry]);

            personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle.mockImplementation(
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                (_personId: PersonID, serviceProviderId: string) => {
                    if (serviceProviderId === registry.serviceProviderId) {
                        return Promise.resolve([kontext]);
                    }

                    return Promise.resolve([secondKontext]);
                },
            );

            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                personId,
                'new@example.org',
                undefined,
                undefined,
                undefined,
            );

            await sut.handleEmailAddressChanged(event);

            expect(personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle).toHaveBeenCalledTimes(2);
            expect(pushAdapterMock.upsertPersonenkontext).toHaveBeenCalledTimes(2);
            expect(pushAdapterMock.upsertPersonenkontext).toHaveBeenCalledWith(registry, kontext, [], undefined);
            expect(pushAdapterMock.upsertPersonenkontext).toHaveBeenCalledWith(
                secondRegistry,
                secondKontext,
                [],
                undefined,
            );
        });

        it('should not resolve personenkontexte when no registries exist', async () => {
            pushRegistryRepoMock.findAll.mockResolvedValue([]);

            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                personId,
                'new@example.org',
                undefined,
                undefined,
                undefined,
            );

            await sut.handleEmailAddressChanged(event);

            expect(personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle).not.toHaveBeenCalled();
            expect(pushAdapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
        });

        it('should update all relevant personenkontexte for a registry', async () => {
            const secondKontext: KontextWithOrgaAndRolle = {
                personenkontext: {
                    id: 'kontext-id-2',
                    personId,
                },
            } as KontextWithOrgaAndRolle;

            personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle.mockResolvedValue([
                kontext,
                secondKontext,
            ]);

            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                personId,
                'new@example.org',
                undefined,
                undefined,
                undefined,
            );

            await sut.handleEmailAddressChanged(event);

            expect(pushAdapterMock.upsertPersonenkontext).toHaveBeenCalledTimes(2);
            expect(pushAdapterMock.upsertPersonenkontext).toHaveBeenCalledWith(registry, kontext, [], undefined);
            expect(pushAdapterMock.upsertPersonenkontext).toHaveBeenCalledWith(registry, secondKontext, [], undefined);
        });
    });

    describe('error handling', () => {
        it('should log an error when pushing a personenkontext fails', async () => {
            const error: SchulconnexPushError = new SchulconnexPushError('Push failed');

            pushAdapterMock.upsertPersonenkontext.mockResolvedValue(Err(error));

            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                personId,
                'new@example.org',
                undefined,
                undefined,
                undefined,
            );

            await sut.handleEmailAddressChanged(event);

            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Could not update Personenkontext ${kontext.personenkontext.id} for person ${personId}`,
                ),
                error,
            );
        });

        it('should not push when resolving the email fails', async () => {
            const error: SchulconnexPushError = new SchulconnexPushError('Failed to resolve email');

            emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValue(Err(error));

            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                personId,
                'new@example.org',
                undefined,
                'old@example.org',
                undefined,
            );

            await sut.handleEmailAddressChanged(event);

            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                expect.stringContaining(`Could not resolve email for person ${personId}`),
                error,
            );
            expect(pushAdapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
        });
    });
});
