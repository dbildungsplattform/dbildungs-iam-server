import { Test, type TestingModule } from '@nestjs/testing';
import { assert, type Mock } from 'vitest';

import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../../test/utils/do-factory.js';
import { DomainErrorMock } from '../../../../../test/utils/error.mock.js';
import { ConfigTestModule, DatabaseTestModule, LoggingTestModule } from '../../../../../test/utils/index.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { type DomainError, SchulconnexPushError } from '../../../../shared/error/index.js';
import { KafkaPersonenkontextUpdatedEvent } from '../../../../shared/events/kafka-personenkontext-updated.event.js';
import { type PersonenkontextEventKontextData } from '../../../../shared/events/personenkontext-event.types.js';
import { PersonenkontextUpdatedEvent } from '../../../../shared/events/personenkontext-updated.event.js';
import { type PersonID, type PersonenkontextID, type RolleID } from '../../../../shared/types/index.js';
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

function createEvent(
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

        registryRepoMock.findAll.mockResolvedValueOnce([registry]);
        rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolle.id, rolle]]));
        personRepoMock.findById.mockResolvedValueOnce(person);
        personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([pushKontext]);
        userLockRepoMock.findByPersonId.mockResolvedValueOnce(userLocks);
        emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValueOnce(Ok(new Map([[person.id, email]])));
        adapterMock.upsertPerson.mockResolvedValueOnce(Ok());
        adapterMock.upsertPersonenkontext.mockResolvedValueOnce(Ok());
        adapterMock.deletePersonenkontext.mockResolvedValueOnce(Ok());
        adapterMock.deletePerson.mockResolvedValueOnce(Ok());
    });

    describe('handlePersonenkontextUpdatedEvent', () => {
        describe('registry and context selection', () => {
            it('should log receipt and return without loading roles when no registries exist', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);
                registryRepoMock.findAll.mockReset().mockResolvedValueOnce([]);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(loggerMock.info).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Schulconnex push for person ${person.id}: Received PersonenkontextUpdatedEvent`,
                );
                expect(registryRepoMock.findAll).toHaveBeenCalledOnce();
                expect(rolleRepoMock.findByIds).not.toHaveBeenCalled();
                expect(personRepoMock.findById).not.toHaveBeenCalled();
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
            });

            it('should propagate a failure while loading registries', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);
                const error: Error = new Error('Registry lookup failed');
                registryRepoMock.findAll.mockReset().mockRejectedValueOnce(error);

                await expect(sut.handlePersonenkontextUpdatedEvent(event)).rejects.toBe(error);

                expect(rolleRepoMock.findByIds).not.toHaveBeenCalled();
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
            });

            it('should propagate a failure while loading roles', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);
                const error: Error = new Error('Role lookup failed');
                rolleRepoMock.findByIds.mockReset().mockRejectedValueOnce(error);

                await expect(sut.handlePersonenkontextUpdatedEvent(event)).rejects.toBe(error);

                expect(personRepoMock.findById).not.toHaveBeenCalled();
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
            });

            it('should return success without pushing when the event has no contexts', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, []);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(rolleRepoMock.findByIds).toHaveBeenCalledExactlyOnceWith([]);
                expect(personRepoMock.findById).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
            });

            it('should load each non-class role only once across new, removed and current contexts', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(
                    person,
                    [
                        newKontext,
                        createKontext('new-class', { orgaTyp: OrganisationsTyp.KLASSE, rolleId: 'class-role' }),
                    ],
                    [removedKontext, createKontext('removed-other', { rolleId: 'rolle-2' })],
                    [newKontext, existingKontext, createKontext('current-other', { rolleId: 'rolle-3' })],
                );
                rolleRepoMock.findByIds.mockReset().mockResolvedValueOnce(new Map());

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(rolleRepoMock.findByIds).toHaveBeenCalledExactlyOnceWith(['rolle-1', 'rolle-2', 'rolle-3']);
                expect(personRepoMock.findById).not.toHaveBeenCalled();
            });

            it('should ignore class contexts even when their role grants the service provider', async () => {
                const newClass: PersonenkontextEventKontextData = createKontext('new-class', {
                    orgaTyp: OrganisationsTyp.KLASSE,
                });
                const removedClass: PersonenkontextEventKontextData = createKontext('removed-class', {
                    orgaTyp: OrganisationsTyp.KLASSE,
                });
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newClass], [removedClass], [newClass]);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(rolleRepoMock.findByIds).toHaveBeenCalledExactlyOnceWith([]);
                expect(personRepoMock.findById).not.toHaveBeenCalled();
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
            });

            it.each(['missing role', 'unrelated service provider'])(
                'should ignore contexts with a %s',
                async (scenario: string) => {
                    const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext], [removedKontext]);
                    const rollen: Map<RolleID, Rolle<true>> = scenario === 'missing role'
                        ? new Map<RolleID, Rolle<true>>()
                        : new Map([
                              [rolle.id, DoFactory.createRolle(true, { serviceProviderIds: ['other-provider'] })],
                          ]);
                    rolleRepoMock.findByIds.mockReset().mockResolvedValueOnce(rollen);

                    const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                    expect(result).toEqual(Ok());
                    expect(personRepoMock.findById).not.toHaveBeenCalled();
                    expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                    expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
                    expect(adapterMock.deletePersonenkontext).not.toHaveBeenCalled();
                    expect(adapterMock.deletePerson).not.toHaveBeenCalled();
                },
            );

            it('should not repush unchanged relevant contexts', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [], [], [existingKontext]);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(personRepoMock.findById).not.toHaveBeenCalled();
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
            });
        });

        describe('creation', () => {
            it('should keep the handler alive after each creation adapter operation', async () => {
                const secondKontext: PersonenkontextEventKontextData = createKontext('second-kontext');
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext, secondKontext]);
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

            it('should create the person before pushing all current contexts on first access', async () => {
                const secondKontext: PersonenkontextEventKontextData = createKontext('second-kontext');
                const secondPushKontext: KontextWithOrgaAndRolle = createPushKontext(secondKontext, person, registry);
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext, secondKontext]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle
                    .mockReset()
                    .mockResolvedValueOnce([secondPushKontext, pushKontext]);
                adapterMock.upsertPersonenkontext.mockResolvedValueOnce(Ok());

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(personRepoMock.findById).toHaveBeenCalledExactlyOnceWith(person.id);
                expect(personenkontextRepoMock.findByPersonWithOrgaAndRolle).toHaveBeenCalledExactlyOnceWith(person.id);
                expect(userLockRepoMock.findByPersonId).toHaveBeenCalledExactlyOnceWith(person.id);
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
                expect(adapterMock.deletePersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
                expect(loggerMock.logUnknownAsError).not.toHaveBeenCalled();
            });

            it('should only push new contexts without recreating a person with existing access', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(
                    person,
                    [newKontext],
                    [],
                    [newKontext, existingKontext],
                );
                personenkontextRepoMock.findByPersonWithOrgaAndRolle
                    .mockReset()
                    .mockResolvedValueOnce([createPushKontext(existingKontext, person, registry), pushKontext]);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    pushKontext,
                    userLocks,
                    email,
                );
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
            });

            it('should push replacement contexts before deleting removed contexts without recreating the person', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext], [removedKontext]);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    pushKontext,
                    userLocks,
                    email,
                );
                expect(adapterMock.deletePersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    person.id,
                    removedKontext.id,
                );
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledBefore(adapterMock.deletePersonenkontext);
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
            });

            it('should treat only unrelated existing contexts as first access', async () => {
                const unrelatedKontext: PersonenkontextEventKontextData = createKontext('unrelated-kontext', {
                    rolleId: 'unrelated-role',
                });
                const classKontext: PersonenkontextEventKontextData = createKontext('class-kontext', {
                    orgaTyp: OrganisationsTyp.KLASSE,
                });
                const event: PersonenkontextUpdatedEvent = createEvent(
                    person,
                    [newKontext, unrelatedKontext, classKontext],
                    [createKontext('removed-unrelated', { rolleId: 'unrelated-role' })],
                    [newKontext, unrelatedKontext, classKontext],
                );

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.upsertPerson).toHaveBeenCalledExactlyOnceWith(registry, person);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    pushKontext,
                    userLocks,
                    email,
                );
                expect(adapterMock.deletePersonenkontext).not.toHaveBeenCalled();
            });

            it('should handle Kafka events through the same public handler', async () => {
                const baseEvent: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);
                const event: KafkaPersonenkontextUpdatedEvent = new KafkaPersonenkontextUpdatedEvent(
                    baseEvent.person,
                    baseEvent.newKontexte,
                    baseEvent.removedKontexte,
                    baseEvent.currentKontexte,
                );

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.upsertPerson).toHaveBeenCalledExactlyOnceWith(registry, person);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    pushKontext,
                    userLocks,
                    email,
                );
            });
        });

        describe('deletion', () => {
            it('should keep the handler alive after each deletion adapter operation', async () => {
                const secondRemovedKontext: PersonenkontextEventKontextData = createKontext('second-removed');
                const event: PersonenkontextUpdatedEvent = createEvent(
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

            it('should delete removed contexts but retain a person with remaining relevant contexts', async () => {
                const secondRemovedKontext: PersonenkontextEventKontextData = createKontext('second-removed');
                const event: PersonenkontextUpdatedEvent = createEvent(
                    person,
                    [],
                    [removedKontext, secondRemovedKontext],
                    [existingKontext],
                );
                adapterMock.deletePersonenkontext.mockResolvedValueOnce(Ok());

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.deletePersonenkontext).toHaveBeenCalledTimes(2);
                expect(adapterMock.deletePersonenkontext).toHaveBeenNthCalledWith(
                    1,
                    registry,
                    person.id,
                    removedKontext.id,
                );
                expect(adapterMock.deletePersonenkontext).toHaveBeenNthCalledWith(
                    2,
                    registry,
                    person.id,
                    secondRemovedKontext.id,
                );
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
                expect(personRepoMock.findById).not.toHaveBeenCalled();
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
            });

            it('should delete the person after deleting their last relevant context', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [], [removedKontext], []);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.deletePersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    person.id,
                    removedKontext.id,
                );
                expect(adapterMock.deletePerson).toHaveBeenCalledExactlyOnceWith(registry, person.id);
                expect(adapterMock.deletePersonenkontext).toHaveBeenCalledBefore(adapterMock.deletePerson);
                expect(personRepoMock.findById).not.toHaveBeenCalled();
            });

            it('should ignore class and unrelated contexts when deciding whether to delete the person', async () => {
                const classKontext: PersonenkontextEventKontextData = createKontext('class-kontext', {
                    orgaTyp: OrganisationsTyp.KLASSE,
                });
                const unrelatedKontext: PersonenkontextEventKontextData = createKontext('unrelated-kontext', {
                    rolleId: 'unrelated-role',
                });
                const event: PersonenkontextUpdatedEvent = createEvent(
                    person,
                    [],
                    [removedKontext, classKontext, unrelatedKontext],
                    [classKontext, unrelatedKontext],
                );

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.deletePersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    person.id,
                    removedKontext.id,
                );
                expect(adapterMock.deletePerson).toHaveBeenCalledExactlyOnceWith(registry, person.id);
            });
        });

        describe('push data', () => {
            it('should resolve email addresses through the email microservice', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);

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

            it('should pass the resolved email address and status to the adapter unchanged', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);
                const microserviceEmail: PersonEmailResponse = {
                    address: 'microservice@example.org',
                    status: EmailAddressStatus.DISABLED,
                };
                emailResolverServiceMock.findEmailsBySpshPersons
                    .mockReset()
                    .mockResolvedValueOnce(Ok(new Map([[person.id, microserviceEmail]])));

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(emailResolverServiceMock.findEmailsBySpshPersons).toHaveBeenCalledExactlyOnceWith([person.id]);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    pushKontext,
                    userLocks,
                    microserviceEmail,
                );
            });

            it('should push an undefined email when the email map has no entry for the person', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);
                emailResolverServiceMock.findEmailsBySpshPersons
                    .mockReset()
                    .mockResolvedValueOnce(Ok(new Map<PersonID, PersonEmailResponse | undefined>()));
                userLockRepoMock.findByPersonId.mockReset().mockResolvedValueOnce([]);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    pushKontext,
                    [],
                    undefined,
                );
            });

            it('should pass through an undefined email returned by the microservice', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);
                emailResolverServiceMock.findEmailsBySpshPersons
                    .mockReset()
                    .mockResolvedValueOnce(
                        Ok(new Map<PersonID, PersonEmailResponse | undefined>([[person.id, undefined]])),
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
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);
                personRepoMock.findById.mockReset().mockResolvedValueOnce(undefined);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [new SchulconnexPushError(`Person ${person.id} not found`)]);
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
            });

            it('should validate all requested contexts before pushing the person or any context', async () => {
                const missingKontext: PersonenkontextEventKontextData = createKontext('missing-kontext');
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext, missingKontext]);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [
                    new SchulconnexPushError(`Personenkontext ${missingKontext.id} not found`),
                ]);
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
            });

            it('should stop context creation and deletion when resolving emails fails', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext], [removedKontext]);
                const error: DomainError = new DomainErrorMock('Email microservice lookup failed');
                emailResolverServiceMock.findEmailsBySpshPersons.mockReset().mockResolvedValueOnce(Err(error));

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [error]);
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
            });

            it('should propagate email microservice errors without pushing', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);
                const error: DomainError = new DomainErrorMock('Email microservice lookup failed');
                emailResolverServiceMock.findEmailsBySpshPersons.mockReset().mockResolvedValueOnce(Err(error));

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [error]);
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
            });

            it('should aggregate unexpected errors thrown while loading push data', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);
                const error: Error = new Error('Person lookup failed');
                personRepoMock.findById.mockReset().mockRejectedValueOnce(error);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [error]);
                expect(loggerMock.logUnknownAsError).toHaveBeenCalledExactlyOnceWith(
                    `[EventID: ${event.eventID}] Schulconnex push for person ${person.id}: Registry ${registry.id} failed`,
                    error,
                );
                expect(adapterMock.upsertPerson).not.toHaveBeenCalled();
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
            });
        });

        describe('adapter failures', () => {
            it('should stop before pushing contexts when creating the person fails', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);
                const error: DomainError = new DomainErrorMock('Person upsert failed');
                adapterMock.upsertPerson.mockReset().mockResolvedValueOnce(Err(error));

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [error]);
                expect(adapterMock.upsertPerson).toHaveBeenCalledExactlyOnceWith(registry, person);
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
            });

            it('should stop remaining upserts and deletions when a context upsert fails', async () => {
                const secondKontext: PersonenkontextEventKontextData = createKontext('second-kontext');
                const thirdKontext: PersonenkontextEventKontextData = createKontext('third-kontext');
                const secondPushKontext: KontextWithOrgaAndRolle = createPushKontext(secondKontext, person, registry);
                const event: PersonenkontextUpdatedEvent = createEvent(
                    person,
                    [newKontext, secondKontext, thirdKontext],
                    [removedKontext],
                );
                const error: DomainError = new DomainErrorMock('Context upsert failed');
                personenkontextRepoMock.findByPersonWithOrgaAndRolle
                    .mockReset()
                    .mockResolvedValueOnce([
                        pushKontext,
                        secondPushKontext,
                        createPushKontext(thirdKontext, person, registry),
                    ]);
                adapterMock.upsertPersonenkontext
                    .mockReset()
                    .mockResolvedValueOnce(Ok())
                    .mockResolvedValueOnce(Err(error));

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [error]);
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
                expect(adapterMock.deletePersonenkontext).not.toHaveBeenCalled();
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
            });

            it('should stop remaining deletions and retain the person when a context deletion fails', async () => {
                const secondRemovedKontext: PersonenkontextEventKontextData = createKontext('second-removed');
                const thirdRemovedKontext: PersonenkontextEventKontextData = createKontext('third-removed');
                const event: PersonenkontextUpdatedEvent = createEvent(
                    person,
                    [],
                    [removedKontext, secondRemovedKontext, thirdRemovedKontext],
                    [],
                );
                const error: DomainError = new DomainErrorMock('Context deletion failed');
                adapterMock.deletePersonenkontext
                    .mockReset()
                    .mockResolvedValueOnce(Ok())
                    .mockResolvedValueOnce(Err(error));

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [error]);
                expect(adapterMock.deletePersonenkontext).toHaveBeenCalledTimes(2);
                expect(adapterMock.deletePersonenkontext).toHaveBeenNthCalledWith(
                    1,
                    registry,
                    person.id,
                    removedKontext.id,
                );
                expect(adapterMock.deletePersonenkontext).toHaveBeenNthCalledWith(
                    2,
                    registry,
                    person.id,
                    secondRemovedKontext.id,
                );
                expect(adapterMock.deletePerson).not.toHaveBeenCalled();
            });

            it('should propagate a failure when deleting the person', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [], [removedKontext], []);
                const error: DomainError = new DomainErrorMock('Person deletion failed');
                adapterMock.deletePerson.mockReset().mockResolvedValueOnce(Err(error));

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [error]);
                expect(adapterMock.deletePersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    registry,
                    person.id,
                    removedKontext.id,
                );
                expect(adapterMock.deletePerson).toHaveBeenCalledExactlyOnceWith(registry, person.id);
            });
        });

        describe('multiple registries', () => {
            it('should independently select contexts for each registry service provider', async () => {
                const secondRegistry: SchulconnexPushRegistry<true> = createRegistry(
                    'registry-2',
                    'service-provider-2',
                );
                const unrelatedRegistry: SchulconnexPushRegistry<true> = createRegistry(
                    'registry-3',
                    'service-provider-3',
                );
                const secondRolle: Rolle<true> = DoFactory.createRolle(true, {
                    id: 'rolle-2',
                    serviceProviderIds: [secondRegistry.serviceProviderId],
                });
                const secondKontext: PersonenkontextEventKontextData = createKontext('second-kontext', {
                    rolleId: secondRolle.id,
                });
                const secondPushKontext: KontextWithOrgaAndRolle = createPushKontext(secondKontext, person, registry);
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext, secondKontext]);
                registryRepoMock.findAll
                    .mockReset()
                    .mockResolvedValueOnce([registry, secondRegistry, unrelatedRegistry]);
                rolleRepoMock.findByIds.mockReset().mockResolvedValueOnce(
                    new Map([
                        [rolle.id, rolle],
                        [secondRolle.id, secondRolle],
                    ]),
                );
                personRepoMock.findById.mockResolvedValueOnce(person);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle
                    .mockReset()
                    .mockResolvedValueOnce([pushKontext, secondPushKontext])
                    .mockResolvedValueOnce([pushKontext, secondPushKontext]);
                userLockRepoMock.findByPersonId.mockResolvedValueOnce(userLocks);
                emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValueOnce(
                    Ok(new Map([[person.id, email]])),
                );
                adapterMock.upsertPerson.mockResolvedValueOnce(Ok());
                adapterMock.upsertPersonenkontext.mockResolvedValueOnce(Ok());

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expect(result).toEqual(Ok());
                expect(personRepoMock.findById).toHaveBeenCalledTimes(2);
                expect(adapterMock.upsertPerson).toHaveBeenCalledTimes(2);
                expect(adapterMock.upsertPerson).toHaveBeenCalledWith(registry, person);
                expect(adapterMock.upsertPerson).toHaveBeenCalledWith(secondRegistry, person);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledTimes(2);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledWith(registry, pushKontext, userLocks, email);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledWith(
                    secondRegistry,
                    secondPushKontext,
                    userLocks,
                    email,
                );
                expect(loggerMock.logUnknownAsError).not.toHaveBeenCalled();
            });

            it('should aggregate returned and thrown failures while still pushing to successful registries', async () => {
                const secondRegistry: SchulconnexPushRegistry<true> = createRegistry('registry-2');
                const thirdRegistry: SchulconnexPushRegistry<true> = createRegistry('registry-3');
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);
                const returnedError: DomainError = new DomainErrorMock('First registry failed');
                const thrownError: Error = new Error('Second registry failed');
                registryRepoMock.findAll.mockReset().mockResolvedValueOnce([registry, secondRegistry, thirdRegistry]);
                personRepoMock.findById.mockResolvedValueOnce(person).mockResolvedValueOnce(person);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle
                    .mockResolvedValueOnce([pushKontext])
                    .mockResolvedValueOnce([pushKontext]);
                userLockRepoMock.findByPersonId.mockResolvedValueOnce(userLocks).mockResolvedValueOnce(userLocks);
                emailResolverServiceMock.findEmailsBySpshPersons
                    .mockResolvedValueOnce(Ok(new Map([[person.id, email]])))
                    .mockResolvedValueOnce(Ok(new Map([[person.id, email]])));
                adapterMock.upsertPerson
                    .mockReset()
                    .mockResolvedValueOnce(Err(returnedError))
                    .mockRejectedValueOnce(thrownError)
                    .mockResolvedValueOnce(Ok());

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [returnedError, thrownError]);
                expect(adapterMock.upsertPerson).toHaveBeenCalledTimes(3);
                expect(adapterMock.upsertPersonenkontext).toHaveBeenCalledExactlyOnceWith(
                    thirdRegistry,
                    pushKontext,
                    userLocks,
                    email,
                );
                expect(loggerMock.logUnknownAsError).toHaveBeenCalledTimes(2);
                expect(loggerMock.logUnknownAsError).toHaveBeenNthCalledWith(
                    1,
                    `[EventID: ${event.eventID}] Schulconnex push for person ${person.id}: Registry ${registry.id} failed`,
                    returnedError,
                );
                expect(loggerMock.logUnknownAsError).toHaveBeenNthCalledWith(
                    2,
                    `[EventID: ${event.eventID}] Schulconnex push for person ${person.id}: Registry ${secondRegistry.id} failed`,
                    thrownError,
                );
            });

            it('should preserve and log rejection reasons that are not Error instances', async () => {
                const event: PersonenkontextUpdatedEvent = createEvent(person, [newKontext]);
                const reason: string = 'Connection closed';
                adapterMock.upsertPerson.mockReset().mockRejectedValueOnce(reason);

                const result: Result<void, DomainError> = await sut.handlePersonenkontextUpdatedEvent(event);

                expectPushFailure(result, event, [reason]);
                expect(loggerMock.logUnknownAsError).toHaveBeenCalledExactlyOnceWith(
                    `[EventID: ${event.eventID}] Schulconnex push for person ${person.id}: Registry ${registry.id} failed`,
                    reason,
                );
                expect(adapterMock.upsertPersonenkontext).not.toHaveBeenCalled();
            });
        });
    });
});
