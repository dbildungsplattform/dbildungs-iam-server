import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../../test/utils/do-factory.js';
import { DomainErrorMock } from '../../../../../test/utils/error.mock.js';
import {
    ConfigTestModule,
    DatabaseTestModule,
    expectErrResult,
    expectOkResult,
    LoggingTestModule,
} from '../../../../../test/utils/index.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { type DomainError, SchulconnexPushError } from '../../../../shared/error/index.js';
import { EmailMicroserviceAddressChangedEvent } from '../../../../shared/events/email-microservice/email-microservice-address-changed.event.js';
import { KafkaPersonenkontextUpdatedEvent } from '../../../../shared/events/kafka-personenkontext-updated.event.js';
import { LocksForPersonChangedEvent } from '../../../../shared/events/locks-for-person-changed.event.js';
import { PersonRenamedEvent } from '../../../../shared/events/person-renamed-event.js';
import { type PersonenkontextEventKontextData } from '../../../../shared/events/personenkontext-event.types.js';
import { PersonenkontextUpdatedEvent } from '../../../../shared/events/personenkontext-updated.event.js';
import { type PersonenkontextID, type PersonID, type RolleID } from '../../../../shared/types/index.js';
import { Err, Ok } from '../../../../shared/util/result.js';
import { EmailResolverService } from '../../../email-microservice/domain/email-resolver.service.js';
import { EmailAddressStatus } from '../../../email/domain/email-address.js';
import { UserLock } from '../../../keycloak-administration/domain/user-lock.js';
import { UserLockRepository } from '../../../keycloak-administration/repository/user-lock.repository.js';
import { OrganisationsTyp } from '../../../organisation/domain/organisation.enums.js';
import { type PersonEmailResponse } from '../../../person/api/person-email-response.js';
import { PersonLockOccasion } from '../../../person/domain/person.enums.js';
import { type Person } from '../../../person/domain/person.js';
import { PersonRepository } from '../../../person/persistence/person.repository.js';
import {
    DBiamPersonenkontextRepo,
    type KontextWithOrgaAndRolle,
} from '../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../../rolle/domain/rolle.enums.js';
import { type Rolle } from '../../../rolle/domain/rolle.js';
import { RolleRepo } from '../../../rolle/repo/rolle.repo.js';
import { SchulconnexPushAdapter } from '../adapter/domain/schulconnex-push.adapter.js';
import { SchulconnexPushRegistryRepo } from '../persistence/schulconnex-push-registry.repo.js';
import { SchulconnexPushHandler } from './schulconnex-push-handler.js';
import { SchulconnexPushRegistry } from './schulconnex-push-registry.js';

function createRegistry(id: string, serviceProviderId: string = 'service-provider-1'): SchulconnexPushRegistry<true> {
    return SchulconnexPushRegistry.construct(
        id,
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-01-01T00:00:00.000Z'),
        serviceProviderId,
        `https://${id}.example.de`,
    );
}

function createKontext(
    id: PersonenkontextID,
    overrides: Partial<PersonenkontextEventKontextData> = {},
): PersonenkontextEventKontextData {
    return {
        id,
        rolleId: 'rolle-1',
        rolle: RollenArt.LEHR,
        orgaId: 'schule-1',
        orgaTyp: OrganisationsTyp.SCHULE,
        isItslearningOrga: false,
        serviceProviderExternalSystems: [],
        ...overrides,
    };
}

function createPushKontext(
    kontext: PersonenkontextEventKontextData,
    person: Person<true>,
    registry: SchulconnexPushRegistry<true>,
): KontextWithOrgaAndRolle {
    return {
        personenkontext: DoFactory.createPersonenkontext(true, {
            id: kontext.id,
            personId: person.id,
            organisationId: kontext.orgaId,
            rolleId: kontext.rolleId,
        }),
        organisation: DoFactory.createOrganisation(true, {
            id: kontext.orgaId,
            typ: kontext.orgaTyp,
        }),
        rolle: DoFactory.createRolle(true, {
            id: kontext.rolleId,
            rollenart: kontext.rolle,
            serviceProviderIds: [registry.serviceProviderId],
        }),
    };
}

function createPersonRenamedEvent(person: Person<true>): PersonRenamedEvent {
    return new PersonRenamedEvent(
        person.id,
        person.vorname,
        person.familienname,
        person.username,
        faker.person.firstName(),
        faker.person.lastName(),
        faker.internet.username(),
    );
}

function createPersonenkontextUpdateEvent(
    person: Person<true>,
    newKontexte: PersonenkontextEventKontextData[],
    removedKontexte: PersonenkontextEventKontextData[] = [],
    currentKontexte: PersonenkontextEventKontextData[] = newKontexte,
): PersonenkontextUpdatedEvent {
    return new PersonenkontextUpdatedEvent(
        {
            id: person.id,
            vorname: person.vorname,
            familienname: person.familienname,
            username: person.username,
        },
        newKontexte,
        removedKontexte,
        currentKontexte,
    );
}

function expectPushFailure(
    result: Result<void, DomainError>,
    event: PersonenkontextUpdatedEvent,
    errors: unknown[],
): void {
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('error', expect.any(SchulconnexPushError));
    expect(result).toHaveProperty('error.code', 'SCHULCONNEX_PUSH_ERROR');
    expect(result).toHaveProperty(
        'error.message',
        `[EventID: ${event.eventID}] Schulconnex push for person ${event.person.id} failed`,
    );
    expect(result).toHaveProperty('error.details', errors);
}

describe('SchulconnexPushHandler', () => {
    let module: TestingModule;
    let sut: SchulconnexPushHandler;
    let loggerMock: DeepMocked<ClassLogger>;
    let registryRepoMock: DeepMocked<SchulconnexPushRegistryRepo>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let personRepoMock: DeepMocked<PersonRepository>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let userLockRepoMock: DeepMocked<UserLockRepository>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;
    let adapterMock: DeepMocked<SchulconnexPushAdapter>;

    let registry: SchulconnexPushRegistry<true>;
    let person: Person<true>;
    let rolle: Rolle<true>;
    let userLocks: UserLock[];
    let email: PersonEmailResponse;
    let newKontext: PersonenkontextEventKontextData;
    let existingKontext: PersonenkontextEventKontextData;
    let removedKontext: PersonenkontextEventKontextData;
    let pushKontext: KontextWithOrgaAndRolle;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule, DatabaseTestModule.forRoot()],
            providers: [
                SchulconnexPushHandler,
                { provide: SchulconnexPushRegistryRepo, useValue: createMock(SchulconnexPushRegistryRepo) },
                { provide: RolleRepo, useValue: createMock(RolleRepo) },
                { provide: PersonRepository, useValue: createMock(PersonRepository) },
                { provide: DBiamPersonenkontextRepo, useValue: createMock(DBiamPersonenkontextRepo) },
                { provide: UserLockRepository, useValue: createMock(UserLockRepository) },
                { provide: EmailResolverService, useValue: createMock(EmailResolverService) },
                { provide: SchulconnexPushAdapter, useValue: createMock(SchulconnexPushAdapter) },
            ],
        }).compile();

        sut = module.get(SchulconnexPushHandler);
        loggerMock = module.get(ClassLogger);
        registryRepoMock = module.get(SchulconnexPushRegistryRepo);
        rolleRepoMock = module.get(RolleRepo);
        personRepoMock = module.get(PersonRepository);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        userLockRepoMock = module.get(UserLockRepository);
        emailResolverServiceMock = module.get(EmailResolverService);
        adapterMock = module.get(SchulconnexPushAdapter);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        registry = createRegistry('registry-1');
        person = DoFactory.createPerson(true, {
            id: 'person-1',
            vorname: 'Anna',
            familienname: 'Test',
            username: 'anna.test',
        });
        rolle = DoFactory.createRolle(true, {
            id: 'rolle-1',
            rollenart: RollenArt.LEHR,
            serviceProviderIds: [registry.serviceProviderId],
        });
        userLocks = [
            UserLock.construct(
                person.id,
                'admin',
                undefined,
                PersonLockOccasion.MANUELL_GESPERRT,
                new Date('2024-01-01T00:00:00.000Z'),
            ),
        ];
        email = { address: 'anna@example.org', status: EmailAddressStatus.ENABLED };
        newKontext = createKontext('new-kontext');
        existingKontext = createKontext('existing-kontext');
        removedKontext = createKontext('removed-kontext');
        pushKontext = createPushKontext(newKontext, person, registry);

        registryRepoMock.findAll.mockResolvedValue([registry]);
        rolleRepoMock.findByIds.mockResolvedValue(new Map([[rolle.id, rolle]]));
        personRepoMock.findById.mockResolvedValue(person);
        personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([pushKontext]);
        personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle.mockResolvedValue([pushKontext]);
        userLockRepoMock.findByPersonId.mockResolvedValue(userLocks);
        emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValue(Ok(new Map([[person.id, email]])));
        emailResolverServiceMock.findEmailBySpshPerson.mockResolvedValue(undefined);
        adapterMock.upsertPerson.mockResolvedValue(Ok());
        adapterMock.upsertPersonenkontext.mockResolvedValue(Ok());
        adapterMock.deletePersonenkontext.mockResolvedValue(Ok());
        adapterMock.deletePerson.mockResolvedValue(Ok());
    });

    describe('handlePersonRenamedEvent', () => {
        it('should log receipt and return without updating person when no registries exist', async () => {
            const event: PersonRenamedEvent = createPersonRenamedEvent(person);
            registryRepoMock.findAll.mockResolvedValueOnce([]);
            personRepoMock.findById.mockResolvedValueOnce(person);

            const result: Result<void, DomainError> = await sut.handlePersonRenamedEvent(event);

            expectOkResult(result);
            expect(loggerMock.info).toHaveBeenCalledWith(
                `[EventID: ${event.eventID}] Schulconnex push for person ${person.id}: Received PersonRenamedEvent`,
            );
            expect(registryRepoMock.findAll).toHaveBeenCalledOnce();
            expect(personRepoMock.findById).toHaveBeenCalled();
            expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
        });

        it('should return error if person could not be found', async () => {
            const event: PersonRenamedEvent = createPersonRenamedEvent(person);
            registryRepoMock.findAll.mockResolvedValueOnce([]);
            personRepoMock.findById.mockResolvedValueOnce(undefined);

            const result: Result<void, DomainError> = await sut.handlePersonRenamedEvent(event);

            expectErrResult(result);
            expect(result.error).toEqual(new SchulconnexPushError(`Person ${person.id} not found`));

            expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
        });

        it('should push person update to registry', async () => {
            const event: PersonRenamedEvent = createPersonRenamedEvent(person);
            registryRepoMock.findAll.mockResolvedValueOnce([registry]);
            personRepoMock.findById.mockResolvedValueOnce(person);

            const result: Result<void, DomainError> = await sut.handlePersonRenamedEvent(event);

            expectOkResult(result);
            expect(loggerMock.info).toHaveBeenCalledWith(
                `[EventID: ${event.eventID}] Schulconnex push for person ${person.id}: Received PersonRenamedEvent`,
            );
            expect(adapterMock.upsertPerson).toHaveBeenCalledWith(registry, person);
        });

        it('should not push person update to registry if no contexts exist', async () => {
            const event: PersonRenamedEvent = createPersonRenamedEvent(person);
            const secondRegistry: SchulconnexPushRegistry<true> = createRegistry('registry-2', 'service-provider-2');
            registryRepoMock.findAll.mockResolvedValueOnce([secondRegistry]);
            personRepoMock.findById.mockResolvedValueOnce(person);
            personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle.mockResolvedValueOnce([]);

            const result: Result<void, DomainError> = await sut.handlePersonRenamedEvent(event);

            expectOkResult(result);
            expect(loggerMock.info).toHaveBeenCalledWith(
                `[EventID: ${event.eventID}] Schulconnex push for person ${person.id}: Received PersonRenamedEvent`,
            );
            expect(personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle).toHaveBeenCalledTimes(1);
            expect(adapterMock.upsertPerson).not.toHaveBeenCalledTimes(1);
        });

        it('should collect errors if upsert fails', async () => {
            const event: PersonRenamedEvent = createPersonRenamedEvent(person);
            registryRepoMock.findAll.mockResolvedValueOnce([registry]);
            personRepoMock.findById.mockResolvedValueOnce(person);
            const error: DomainError = new DomainErrorMock('Person upsert failed');
            adapterMock.upsertPerson.mockResolvedValueOnce(Err(error));

            const result: Result<void, DomainError> = await sut.handlePersonRenamedEvent(event);

            expectErrResult(result);
            expect(result.error).toEqual(new SchulconnexPushError(`Could not update Person ${person.id}`, [error]));
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `[EventID: ${event.eventID}] Could not update Person ${person.id}`,
                error,
            );
            expect(adapterMock.upsertPerson).toHaveBeenCalledWith(registry, person);
        });

        it('should call keepAlive', async () => {
            const event: PersonRenamedEvent = createPersonRenamedEvent(person);
            registryRepoMock.findAll.mockResolvedValueOnce([registry]);
            personRepoMock.findById.mockResolvedValueOnce(person);
            const keepAlive: Mock<() => void> = vi.fn();

            const result: Result<void, DomainError> = await sut.handlePersonRenamedEvent(event, keepAlive);

            expectOkResult(result);
            expect(keepAlive).toHaveBeenCalled();
        });
    });

    describe('handlePersonenkontextUpdatedEvent', () => {
        describe('registry and context selection', () => {
            it('should log receipt and return without loading roles when no registries exist', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [newKontext]);
                registryRepoMock.findAll.mockResolvedValueOnce([]);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(loggerMock.info).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Schulconnex push for person ${person.id}: Received PersonenkontextUpdatedEvent`,
                );
                expect(registryRepoMock.findAll).toHaveBeenCalledOnce();
                expect(rolleRepoMock.findByIds).not.toHaveBeenCalled();
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
            });

            it('should propagate a failure while loading registries', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [newKontext]);
                const error: Error = new Error('Registry lookup failed');
                registryRepoMock.findAll.mockRejectedValueOnce(error);

                await expect(sut.handlePersonenkontextUpdatedEvent(event)).rejects.toBe(error);
                expect(rolleRepoMock.findByIds).not.toHaveBeenCalled();
            });

            it('should propagate a failure while loading roles', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [newKontext]);
                const error: Error = new Error('Role lookup failed');
                rolleRepoMock.findByIds.mockRejectedValueOnce(error);

                await expect(sut.handlePersonenkontextUpdatedEvent(event)).rejects.toBe(error);
                expect(personRepoMock.findById).not.toHaveBeenCalled();
            });

            it('should return success without pushing when the event has no contexts', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, []);
                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(rolleRepoMock.findByIds).toHaveBeenCalledExactlyOnceWith([]);
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
            });

            it('should load each non-class role only once across new, removed and current contexts', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(
                    person,
                    [
                        newKontext,
                        createKontext('new-class', { orgaTyp: OrganisationsTyp.KLASSE, rolleId: 'class-role' }),
                    ],
                    [removedKontext, createKontext('removed-other', { rolleId: 'rolle-2' })],
                    [newKontext, existingKontext, createKontext('current-other', { rolleId: 'rolle-3' })],
                );
                rolleRepoMock.findByIds.mockResolvedValueOnce(new Map());

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(rolleRepoMock.findByIds).toHaveBeenCalledExactlyOnceWith(['rolle-1', 'rolle-2', 'rolle-3']);
            });

            it('should ignore class contexts', async () => {
                const newClass: PersonenkontextEventKontextData = createKontext('new-class', {
                    orgaTyp: OrganisationsTyp.KLASSE,
                });
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [newClass]);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
            });

            it.each(['missing role', 'unrelated service provider'])(
                'should ignore contexts with a %s',
                async (scenario: string) => {
                    const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(
                        person,
                        [newKontext],
                        [removedKontext],
                    );
                    const rollen: Map<RolleID, Rolle<true>> = scenario === 'missing role'
                        ? new Map<RolleID, Rolle<true>>()
                        : new Map([
                              [rolle.id, DoFactory.createRolle(true, { serviceProviderIds: ['other-provider'] })],
                          ]);
                    rolleRepoMock.findByIds.mockResolvedValueOnce(rollen);

                    const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                    expect(result).toEqual(Ok());
                    expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
                },
            );

            it('should not repush unchanged relevant contexts', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(
                    person,
                    [],
                    [],
                    [existingKontext],
                );
                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
            });
        });

        describe('creation', () => {
            it('should create the person before pushing all current contexts on first access', async () => {
                const secondKontext: PersonenkontextEventKontextData = createKontext('second-kontext');
                const secondPushKontext: KontextWithOrgaAndRolle = createPushKontext(secondKontext, person, registry);
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [
                    newKontext,
                    secondKontext,
                ]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    secondPushKontext,
                    pushKontext,
                ]);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.upsertPerson).toHaveBeenCalledExactlyOnceWith(registry, person);
                expect(adapterMock.upsertPerson).toHaveBeenCalledBefore(adapterMock.upsertPersonenkontext);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledTimes(2);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenNthCalledWith(
                    1,
                    registry,
                    pushKontext,
                    userLocks,
                    email,
                );
                expect(adapterMock.upsertPersonenkontext).toHaveBeenNthCalledWith(
                    2,
                    registry,
                    secondPushKontext,
                    userLocks,
                    email,
                );
            });

            it('should only push new contexts without recreating a person with existing access', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(
                    person,
                    [newKontext],
                    [],
                    [newKontext, existingKontext],
                );
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    createPushKontext(existingKontext, person, registry),
                    pushKontext,
                ]);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    pushKontext,
                    userLocks,
                    email,
                );
            });

            it('should push replacement contexts before deleting removed contexts', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(
                    person,
                    [newKontext],
                    [removedKontext],
                );
                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledBefore(adapterMock.deletePersonenkontext);
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
            });

            it('should handle Kafka events through the same public handler', async () => {
                const baseEvent: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [newKontext]);
                const event: KafkaPersonenkontextUpdatedEvent = new KafkaPersonenkontextUpdatedEvent(
                    baseEvent.person,
                    baseEvent.newKontexte,
                    baseEvent.removedKontexte,
                    baseEvent.currentKontexte,
                );

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.upsertPerson).toHaveBeenCalledExactlyOnceWith(registry, person);
            });
        });

        describe('deletion', () => {
            it('should delete removed contexts but retain a person with remaining relevant contexts', async () => {
                const secondRemovedKontext: PersonenkontextEventKontextData = createKontext('second-removed');
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(
                    person,
                    [],
                    [removedKontext, secondRemovedKontext],
                    [existingKontext],
                );

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.deletePersonenkontext).toHaveBeenCalledTimes(2);
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
            });

            it('should delete the person after deleting their last relevant context', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(
                    person,
                    [],
                    [removedKontext],
                    [],
                );
                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.deletePersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    person.id,
                    removedKontext.id,
                );
                expect(adapterMock.deletePerson).toHaveBeenCalledExactlyOnceWith(registry, person.id);
                expect(adapterMock.deletePersonenkontext).toHaveBeenCalledBefore(adapterMock.deletePerson);
            });

            it('should ignore class and unrelated contexts when deciding whether to delete the person', async () => {
                const classKontext: PersonenkontextEventKontextData = createKontext('class-kontext', {
                    orgaTyp: OrganisationsTyp.KLASSE,
                });
                const unrelatedKontext: PersonenkontextEventKontextData = createKontext('unrelated-kontext', {
                    rolleId: 'unrelated-role',
                });
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(
                    person,
                    [],
                    [removedKontext, classKontext, unrelatedKontext],
                    [classKontext, unrelatedKontext],
                );

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.deletePerson).toHaveBeenCalledExactlyOnceWith(registry, person.id);
            });
        });

        describe('push data', () => {
            it('should resolve email addresses through the email microservice', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [newKontext]);
                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(emailResolverServiceMock.findEmailsBySpshPersons).toHaveBeenCalledExactlyOnceWith([person.id]);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    pushKontext,
                    userLocks,
                    email,
                );
            });

            it('should pass an undefined email when no email is available', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [newKontext]);
                emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValueOnce(
                    Ok(new Map<PersonID, PersonEmailResponse | undefined>()),
                );

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    pushKontext,
                    userLocks,
                    undefined,
                );
            });

            it('should fail without pushing when the person no longer exists', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [newKontext]);
                personRepoMock.findById.mockResolvedValueOnce(undefined);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [new SchulconnexPushError(`Person ${person.id} not found`)]);
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
            });

            it('should stop context creation and deletion when resolving emails fails', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(
                    person,
                    [newKontext],
                    [removedKontext],
                );
                const error: DomainError = new DomainErrorMock('Email microservice lookup failed');
                emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValueOnce(Err(error));

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [error]);
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePersonenkontext).not.toHaveBeenCalled();
            });

            it('should aggregate unexpected errors thrown while loading push data', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [newKontext]);
                const error: Error = new Error('Person lookup failed');
                personRepoMock.findById.mockRejectedValueOnce(error);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [error]);
                expect(loggerMock.logUnknownAsError).toHaveBeenCalledExactlyOnceWith(
                    `[EventID: ${event.eventID}] Schulconnex push for person ${person.id}: Registry ${registry.id} failed`,
                    error,
                );
            });

            it('should validate all requested contexts before pushing the person or any context', async () => {
                const missingKontext: PersonenkontextEventKontextData = createKontext('missing-kontext');
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [
                    newKontext,
                    missingKontext,
                ]);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [
                    new SchulconnexPushError(`Personenkontext ${missingKontext.id} not found`),
                ]);
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
            });
        });

        describe('adapter failures', () => {
            it('should stop before pushing contexts when creating the person fails', async () => {
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [newKontext]);
                const error: DomainError = new DomainErrorMock('Person upsert failed');
                adapterMock.upsertPerson.mockResolvedValueOnce(Err(error));

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [error]);
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
            });

            it('should stop remaining upserts and deletions when a context upsert fails', async () => {
                const secondKontext: PersonenkontextEventKontextData = createKontext('second-kontext');
                const secondPushKontext: KontextWithOrgaAndRolle = createPushKontext(secondKontext, person, registry);
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(
                    person,
                    [newKontext, secondKontext],
                    [removedKontext],
                );
                const error: DomainError = new DomainErrorMock('Context upsert failed');
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    pushKontext,
                    secondPushKontext,
                ]);
                adapterMock.upsertPersonenkontext.mockResolvedValueOnce(Ok()).mockResolvedValueOnce(Err(error));

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [error]);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledTimes(2);
                expect(adapterMock.deletePersonenkontext).not.toHaveBeenCalled();
            });

            it('should stop remaining deletions when a context deletion fails', async () => {
                const secondRemovedKontext: PersonenkontextEventKontextData = createKontext('second-removed');
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(
                    person,
                    [],
                    [removedKontext, secondRemovedKontext],
                    [],
                );
                const error: DomainError = new DomainErrorMock('Context deletion failed');
                adapterMock.deletePersonenkontext.mockResolvedValueOnce(Ok()).mockResolvedValueOnce(Err(error));

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [error]);
                expect(adapterMock.deletePersonenkontext).toHaveBeenCalledTimes(2);
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
            });
        });

        describe('multiple registries', () => {
            it('should independently select contexts for each registry service provider', async () => {
                const secondRegistry: SchulconnexPushRegistry<true> = createRegistry(
                    'registry-2',
                    'service-provider-2',
                );
                const secondRolle: Rolle<true> = DoFactory.createRolle(true, {
                    id: 'rolle-2',
                    serviceProviderIds: [secondRegistry.serviceProviderId],
                });
                const secondKontext: PersonenkontextEventKontextData = createKontext('second-kontext', {
                    rolleId: secondRolle.id,
                });
                const secondPushKontext: KontextWithOrgaAndRolle = createPushKontext(
                    secondKontext,
                    person,
                    secondRegistry,
                );
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [
                    newKontext,
                    secondKontext,
                ]);
                registryRepoMock.findAll.mockResolvedValueOnce([registry, secondRegistry]);
                rolleRepoMock.findByIds.mockResolvedValueOnce(
                    new Map([
                        [rolle.id, rolle],
                        [secondRolle.id, secondRolle],
                    ]),
                );
                personenkontextRepoMock.findByPersonWithOrgaAndRolle
                    .mockResolvedValueOnce([pushKontext, secondPushKontext])
                    .mockResolvedValueOnce([pushKontext, secondPushKontext]);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.upsertPerson).toHaveBeenCalledTimes(2);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledWith(registry, pushKontext, userLocks, email);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledWith(
                    secondRegistry,
                    secondPushKontext,
                    userLocks,
                    email,
                );
            });

            it('should aggregate returned and thrown failures while still pushing successful registries', async () => {
                const secondRegistry: SchulconnexPushRegistry<true> = createRegistry('registry-2');
                const thirdRegistry: SchulconnexPushRegistry<true> = createRegistry('registry-3');
                const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [newKontext]);
                const returnedError: DomainError = new DomainErrorMock('First registry failed');
                const thrownError: Error = new Error('Second registry failed');
                registryRepoMock.findAll.mockResolvedValueOnce([registry, secondRegistry, thirdRegistry]);
                adapterMock.upsertPerson
                    .mockResolvedValueOnce(Err(returnedError))
                    .mockRejectedValueOnce(thrownError)
                    .mockResolvedValueOnce(Ok());

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [returnedError, thrownError]);
                expect(adapterMock.upsertPerson).toHaveBeenCalledTimes(3);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledTimes(1);
                expect(loggerMock.logUnknownAsError).toHaveBeenCalledTimes(2);
            });
        });
    });

    describe('handleEmailAddressChanged', () => {
        it('should update all relevant personenkontexte with the primary email from the event and return Ok', async () => {
            const newPrimaryEmail: PersonEmailResponse = {
                address: 'new@example.org',
                status: EmailAddressStatus.ENABLED,
            };
            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                person.id,
                newPrimaryEmail.address,
                undefined,
                'old@example.org',
                undefined,
            );

            const result: Result<void, DomainError> = await sut.handleEmailAddressChanged(event);

            expect(result).toEqual(Ok());
            expect(registryRepoMock.findAll).toHaveBeenCalledOnce();
            expect(userLockRepoMock.findByPersonId).toHaveBeenCalledExactlyOnceWith(person.id);
            expect(emailResolverServiceMock.findEmailBySpshPerson).not.toHaveBeenCalled();
            expect(
                personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle,
            ).toHaveBeenCalledExactlyOnceWith(person.id, registry.serviceProviderId);
            expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                registry,
                pushKontext,
                userLocks,
                newPrimaryEmail,
            );
        });

        it('should push no email when the event contains no primary email', async () => {
            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                person.id,
                undefined,
                undefined,
                'old@example.org',
                undefined,
            );

            const result: Result<void, DomainError> = await sut.handleEmailAddressChanged(event);

            expect(result).toEqual(Ok());
            expect(emailResolverServiceMock.findEmailBySpshPerson).not.toHaveBeenCalled();
            expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                registry,
                pushKontext,
                userLocks,
                undefined,
            );
        });

        it('should not push when no relevant personenkontexte exist', async () => {
            personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle.mockResolvedValueOnce([]);
            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                person.id,
                'new@example.org',
                undefined,
                undefined,
                undefined,
            );

            const result: Result<void, DomainError> = await sut.handleEmailAddressChanged(event);

            expect(result).toEqual(Ok());
            expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
        });
    });

    describe('handleLocksForPersonChanged', () => {
        it('should update all relevant personenkontexte with current locks and resolved email', async () => {
            const currentLocks: UserLock[] = [
                UserLock.construct(person.id, 'admin-id', new Date(), PersonLockOccasion.MANUELL_GESPERRT, new Date()),
            ];
            const currentEmail: PersonEmailResponse = {
                address: 'current@example.org',
                status: EmailAddressStatus.ENABLED,
            };
            userLockRepoMock.findByPersonId.mockResolvedValueOnce(currentLocks);
            emailResolverServiceMock.findEmailBySpshPerson.mockResolvedValueOnce(currentEmail);
            const event: LocksForPersonChangedEvent = new LocksForPersonChangedEvent(person.id, [], []);

            const result: Result<void, DomainError> = await sut.handleLocksForPersonChanged(event);

            expect(result).toEqual(Ok());
            expect(emailResolverServiceMock.findEmailBySpshPerson).toHaveBeenCalledExactlyOnceWith(person.id);
            expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                registry,
                pushKontext,
                currentLocks,
                currentEmail,
            );
        });

        it('should use current locks instead of locks from the event', async () => {
            const currentLocks: UserLock[] = [
                UserLock.construct(person.id, 'admin-id', new Date(), PersonLockOccasion.MANUELL_GESPERRT, new Date()),
            ];
            userLockRepoMock.findByPersonId.mockResolvedValueOnce(currentLocks);
            const event: LocksForPersonChangedEvent = new LocksForPersonChangedEvent(
                person.id,
                [{ locked_until: new Date(), locked_occasion: PersonLockOccasion.MANUELL_GESPERRT }],
                [{ locked_until: undefined, locked_occasion: PersonLockOccasion.MANUELL_GESPERRT }],
            );

            const result: Result<void, DomainError> = await sut.handleLocksForPersonChanged(event);

            expect(result).toEqual(Ok());
            expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                registry,
                pushKontext,
                currentLocks,
                undefined,
            );
        });

        it('should not push when no relevant personenkontexte exist', async () => {
            personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle.mockResolvedValueOnce([]);
            const event: LocksForPersonChangedEvent = new LocksForPersonChangedEvent(person.id, [], []);

            const result: Result<void, DomainError> = await sut.handleLocksForPersonChanged(event);

            expect(result).toEqual(Ok());
            expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
            expect(emailResolverServiceMock.findEmailBySpshPerson).toHaveBeenCalledExactlyOnceWith(person.id);
        });
    });

    describe('email and lock update selection', () => {
        it('should update relevant personenkontexte for every registry', async () => {
            const newPrimaryEmail: PersonEmailResponse = {
                address: 'new@example.org',
                status: EmailAddressStatus.ENABLED,
            };
            const secondRegistry: SchulconnexPushRegistry<true> = createRegistry('registry-2', 'service-provider-2');
            const secondKontextData: PersonenkontextEventKontextData = createKontext('second-kontext');
            const secondPushKontext: KontextWithOrgaAndRolle = createPushKontext(
                secondKontextData,
                person,
                secondRegistry,
            );
            registryRepoMock.findAll.mockResolvedValueOnce([registry, secondRegistry]);
            personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle.mockImplementation(
                (_personId: PersonID, serviceProviderId: string): Promise<KontextWithOrgaAndRolle[]> =>
                    Promise.resolve(
                        serviceProviderId === registry.serviceProviderId ? [pushKontext] : [secondPushKontext],
                    ),
            );
            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                person.id,
                newPrimaryEmail.address,
                undefined,
                undefined,
                undefined,
            );

            const result: Result<void, DomainError> = await sut.handleEmailAddressChanged(event);

            expect(result).toEqual(Ok());
            expect(personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle).toHaveBeenCalledTimes(2);
            expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledTimes(2);
            expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledWith(
                registry,
                pushKontext,
                userLocks,
                newPrimaryEmail,
            );
            expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledWith(
                secondRegistry,
                secondPushKontext,
                userLocks,
                newPrimaryEmail,
            );
        });

        it('should not resolve personenkontexte when no registries exist', async () => {
            registryRepoMock.findAll.mockResolvedValueOnce([]);
            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                person.id,
                'new@example.org',
                undefined,
                undefined,
                undefined,
            );

            const result: Result<void, DomainError> = await sut.handleEmailAddressChanged(event);

            expect(result).toEqual(Ok());
            expect(personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle).not.toHaveBeenCalled();
            expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
        });

        it('should update all relevant personenkontexte for a registry sequentially', async () => {
            const newPrimaryEmail: PersonEmailResponse = {
                address: 'new@example.org',
                status: EmailAddressStatus.ENABLED,
            };
            const secondKontextData: PersonenkontextEventKontextData = createKontext('second-kontext');
            const secondPushKontext: KontextWithOrgaAndRolle = createPushKontext(secondKontextData, person, registry);
            personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle.mockResolvedValueOnce([
                pushKontext,
                secondPushKontext,
            ]);
            let resolveFirstPush: ((result: Result<void, DomainError>) => void) | undefined;
            const firstPush: Promise<Result<void, DomainError>> = new Promise(
                (resolve: (value: Result<void, DomainError>) => void): void => {
                    resolveFirstPush = resolve;
                },
            );
            adapterMock.upsertPersonenkontext.mockReturnValueOnce(firstPush).mockResolvedValueOnce(Ok());
            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                person.id,
                newPrimaryEmail.address,
                undefined,
                undefined,
                undefined,
            );
            const handling: Promise<Result<void, DomainError>> = sut.handleEmailAddressChanged(event);

            try {
                await vi.waitFor(() => {
                    expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledTimes(1);
                });
            } finally {
                resolveFirstPush?.(Ok());
            }

            const result: Result<void, DomainError> = await handling;
            expect(result).toEqual(Ok());
            expect(adapterMock.upsertPersonenkontext).toHaveBeenNthCalledWith(
                2,
                registry,
                secondPushKontext,
                userLocks,
                newPrimaryEmail,
            );
        });
    });

    describe('email and lock update error handling', () => {
        it('should return Err when pushing a personenkontext fails', async () => {
            const error: SchulconnexPushError = new SchulconnexPushError('Push failed');
            adapterMock.upsertPersonenkontext.mockResolvedValueOnce(Err(error));
            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                person.id,
                'new@example.org',
                undefined,
                undefined,
                undefined,
            );

            const result: Result<void, DomainError> = await sut.handleEmailAddressChanged(event);

            expect(result.ok).toBe(false);
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Could not update Personenkontext ${pushKontext.personenkontext.id} for person ${person.id}`,
                ),
                error,
            );
        });

        it('should propagate push failures from the locks handler', async () => {
            const error: SchulconnexPushError = new SchulconnexPushError('Push failed');
            adapterMock.upsertPersonenkontext.mockResolvedValueOnce(Err(error));
            const event: LocksForPersonChangedEvent = new LocksForPersonChangedEvent(person.id, [], []);

            const result: Result<void, DomainError> = await sut.handleLocksForPersonChanged(event);

            expect(result.ok).toBe(false);
        });

        it('should continue pushing remaining personenkontexte and return Err', async () => {
            const newPrimaryEmail: PersonEmailResponse = {
                address: 'new@example.org',
                status: EmailAddressStatus.ENABLED,
            };
            const secondKontextData: PersonenkontextEventKontextData = createKontext('second-kontext');
            const secondPushKontext: KontextWithOrgaAndRolle = createPushKontext(secondKontextData, person, registry);
            const error: SchulconnexPushError = new SchulconnexPushError('Push failed');
            personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle.mockResolvedValueOnce([
                pushKontext,
                secondPushKontext,
            ]);
            adapterMock.upsertPersonenkontext.mockResolvedValueOnce(Err(error)).mockResolvedValueOnce(Ok());
            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                person.id,
                newPrimaryEmail.address,
                undefined,
                undefined,
                undefined,
            );

            const result: Result<void, DomainError> = await sut.handleEmailAddressChanged(event);

            expect(result.ok).toBe(false);
            expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledTimes(2);
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledOnce();
        });
    });

    describe('keepAlive', () => {
        it('should keep the handler alive after each creation adapter operation', async () => {
            const secondKontext: PersonenkontextEventKontextData = createKontext('second-kontext');
            const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(person, [
                newKontext,
                secondKontext,
            ]);
            const keepAlive: Mock<() => void> = vi.fn();

            personenkontextRepoMock.findByPersonWithOrgaAndRolle
                .mockReset()
                .mockResolvedValueOnce([pushKontext, createPushKontext(secondKontext, person, registry)]);

            adapterMock.upsertPersonenkontext.mockResolvedValueOnce(Ok());

            const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event, keepAlive);

            expect(result).toEqual(Ok());
            expect(keepAlive).toHaveBeenCalledTimes(3);
            expect(adapterMock.upsertPerson).toHaveBeenCalledBefore(keepAlive);
            expect(keepAlive).toHaveBeenCalledBefore(adapterMock.upsertPersonenkontext);

            const [firstContextUpsert, secondContextUpsert]: number[] =
                adapterMock.upsertPersonenkontext.mock.invocationCallOrder;

            assert.isDefined(firstContextUpsert);
            assert.isDefined(secondContextUpsert);

            expect(keepAlive.mock.invocationCallOrder[1]).toBeGreaterThan(firstContextUpsert);
            expect(keepAlive.mock.invocationCallOrder[1]).toBeLessThan(secondContextUpsert);
            expect(keepAlive.mock.invocationCallOrder[2]).toBeGreaterThan(secondContextUpsert);
        });

        it('should keep the handler alive after each deletion adapter operation', async () => {
            const secondRemovedKontext: PersonenkontextEventKontextData = createKontext('second-removed');
            const event: PersonenkontextUpdatedEvent = createPersonenkontextUpdateEvent(
                person,
                [],
                [removedKontext, secondRemovedKontext],
                [],
            );
            const keepAlive: Mock<() => void> = vi.fn();

            adapterMock.deletePersonenkontext.mockResolvedValueOnce(Ok());

            const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event, keepAlive);

            expect(result).toEqual(Ok());
            expect(keepAlive).toHaveBeenCalledTimes(3);
            expect(adapterMock.deletePersonenkontext).toHaveBeenCalledBefore(keepAlive);

            const [, secondContextDeletion]: number[] = adapterMock.deletePersonenkontext.mock.invocationCallOrder;

            const [personDeletion]: number[] = adapterMock.deletePerson.mock.invocationCallOrder;

            assert.isDefined(secondContextDeletion);
            assert.isDefined(personDeletion);

            expect(keepAlive.mock.invocationCallOrder[0]).toBeLessThan(secondContextDeletion);
            expect(keepAlive.mock.invocationCallOrder[1]).toBeGreaterThan(secondContextDeletion);
            expect(keepAlive.mock.invocationCallOrder[1]).toBeLessThan(personDeletion);
            expect(keepAlive.mock.invocationCallOrder[2]).toBeGreaterThan(personDeletion);
        });

        it('should call keepAlive after updating a personenkontext for an email change', async () => {
            const keepAlive: Mock<() => void> = vi.fn();

            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                person.id,
                'new@example.org',
                undefined,
                'old@example.org',
                undefined,
            );

            const result: Result<void, DomainError> = await sut.handleEmailAddressChanged(event, keepAlive);

            expect(result).toEqual(Ok());
            expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledOnce();
            expect(keepAlive).toHaveBeenCalledOnce();
            expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledBefore(keepAlive);
        });

        it('should call keepAlive after updating a personenkontext for a lock change', async () => {
            const keepAlive: Mock<() => void> = vi.fn();

            const event: LocksForPersonChangedEvent = new LocksForPersonChangedEvent(person.id, [], []);

            const result: Result<void, DomainError> = await sut.handleLocksForPersonChanged(event, keepAlive);

            expect(result).toEqual(Ok());
            expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledOnce();
            expect(keepAlive).toHaveBeenCalledOnce();
            expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledBefore(keepAlive);
        });

        it('should call keepAlive after every personenkontext update', async () => {
            const keepAlive: Mock<() => void> = vi.fn();

            const secondKontextData: PersonenkontextEventKontextData = createKontext('second-kontext');

            const secondPushKontext: KontextWithOrgaAndRolle = createPushKontext(secondKontextData, person, registry);

            personenkontextRepoMock.findByPersonAndServiceProviderWithOrgaAndRolle.mockResolvedValueOnce([
                pushKontext,
                secondPushKontext,
            ]);

            const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                person.id,
                'new@example.org',
                undefined,
                'old@example.org',
                undefined,
            );

            const result: Result<void, DomainError> = await sut.handleEmailAddressChanged(event, keepAlive);

            expect(result).toEqual(Ok());
            expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledTimes(2);
            expect(keepAlive).toHaveBeenCalledTimes(2);

            const [firstUpsert, secondUpsert]: number[] = adapterMock.upsertPersonenkontext.mock.invocationCallOrder;

            const [firstKeepAlive, secondKeepAlive]: number[] = keepAlive.mock.invocationCallOrder;

            assert.isDefined(firstUpsert);
            assert.isDefined(secondUpsert);
            assert.isDefined(firstKeepAlive);
            assert.isDefined(secondKeepAlive);

            expect(firstKeepAlive).toBeGreaterThan(firstUpsert);
            expect(firstKeepAlive).toBeLessThan(secondUpsert);
            expect(secondKeepAlive).toBeGreaterThan(secondUpsert);
        });
    });

    describe('concurrency handling', () => {
        it('should serialize email and lock updates for the same person', async () => {
            const newPrimaryEmail: PersonEmailResponse = {
                address: 'new@example.org',
                status: EmailAddressStatus.ENABLED,
            };
            const currentLock: UserLock = UserLock.construct(
                person.id,
                'admin-id',
                new Date(),
                PersonLockOccasion.MANUELL_GESPERRT,
                new Date(),
            );
            const currentEmail: PersonEmailResponse = {
                address: 'current@example.org',
                status: EmailAddressStatus.ENABLED,
            };
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]).mockResolvedValueOnce([currentLock]);
            emailResolverServiceMock.findEmailBySpshPerson.mockResolvedValueOnce(currentEmail);
            let resolveFirstPush: ((result: Result<void, DomainError>) => void) | undefined;
            const firstPush: Promise<Result<void, DomainError>> = new Promise(
                (resolve: (value: Result<void, DomainError>) => void): void => {
                    resolveFirstPush = resolve;
                },
            );
            adapterMock.upsertPersonenkontext.mockReturnValueOnce(firstPush).mockResolvedValueOnce(Ok());
            const emailEvent: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
                person.id,
                newPrimaryEmail.address,
                undefined,
                'old@example.org',
                undefined,
            );
            const locksEvent: LocksForPersonChangedEvent = new LocksForPersonChangedEvent(person.id, [], []);
            const emailHandling: Promise<Result<void, DomainError>> = sut.handleEmailAddressChanged(emailEvent);
            let locksHandling: Promise<Result<void, DomainError>> | undefined;

            try {
                await vi.waitFor(() => {
                    expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledTimes(1);
                });
                locksHandling = sut.handleLocksForPersonChanged(locksEvent);
                await Promise.resolve();
                expect(userLockRepoMock.findByPersonId).toHaveBeenCalledTimes(1);
                expect(emailResolverServiceMock.findEmailBySpshPerson).not.toHaveBeenCalled();
            } finally {
                resolveFirstPush?.(Ok());
            }

            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            if (!locksHandling) {
                throw new Error('Locks handling was not started');
            }

            const [emailResult, locksResult]: [Result<void, DomainError>, Result<void, DomainError>] =
                await Promise.all([emailHandling, locksHandling]);

            expect(emailResult).toEqual(Ok());
            expect(locksResult).toEqual(Ok());
            expect(userLockRepoMock.findByPersonId).toHaveBeenCalledTimes(2);
            expect(emailResolverServiceMock.findEmailBySpshPerson).toHaveBeenCalledExactlyOnceWith(person.id);
            expect(adapterMock.upsertPersonenkontext).toHaveBeenNthCalledWith(
                1,
                registry,
                pushKontext,
                [],
                newPrimaryEmail,
            );
            expect(adapterMock.upsertPersonenkontext).toHaveBeenNthCalledWith(
                2,
                registry,
                pushKontext,
                [currentLock],
                currentEmail,
            );
        });
    });
});
