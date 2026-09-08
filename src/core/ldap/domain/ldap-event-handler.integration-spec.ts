import { faker } from '@faker-js/faker';
import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';

import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { DatabaseTestModule, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS, DoFactory } from '../../../../test/utils/index.js';
import { EmailAddressStatus } from '../../../modules/email/domain/email-address.js';
import { OrganisationsTyp } from '../../../modules/organisation/domain/organisation.enums.js';
import { Organisation } from '../../../modules/organisation/domain/organisation.js';
import { OrganisationRepository } from '../../../modules/organisation/persistence/organisation.repository.js';
import { Person } from '../../../modules/person/domain/person.js';
import { PersonRepository } from '../../../modules/person/persistence/person.repository.js';
import { PersonenkontextFactory } from '../../../modules/personenkontext/domain/personenkontext.factory.js';
import { DBiamPersonenkontextRepo } from '../../../modules/personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../../modules/rolle/domain/rolle.enums.js';
import { RolleRepo } from '../../../modules/rolle/repo/rolle.repo.js';
import { DomainError, MissingPermissionsError } from '../../../shared/error/index.js';
import { EmailMicroserviceAddressChangedEvent } from '../../../shared/events/email-microservice/email-microservice-address-changed.event.js';
import { EmailAddressChangedEvent } from '../../../shared/events/email/email-address-changed.event.js';
import { EmailAddressGeneratedEvent } from '../../../shared/events/email/email-address-generated.event.js';
import { EmailAddressMarkedForDeletionEvent } from '../../../shared/events/email/email-address-marked-for-deletion.event.js';
import { EmailAddressesPurgedEvent } from '../../../shared/events/email/email-addresses-purged.event.js';
import { OrganisationDeletedEvent } from '../../../shared/events/organisation-deleted.event.js';
import { PersonDeletedAfterDeadlineExceededEvent } from '../../../shared/events/person-deleted-after-deadline-exceeded.event.js';
import { PersonDeletedEvent } from '../../../shared/events/person-deleted.event.js';
import { PersonRenamedEvent } from '../../../shared/events/person-renamed-event.js';
import { PersonenkontextUpdatedEvent } from '../../../shared/events/personenkontext-updated.event.js';
import { PersonID, PersonUsername } from '../../../shared/types/aggregate-ids.types.js';
import { Ok } from '../../../shared/util/result.js';
import { GlobalValidationPipe } from '../../../shared/validation/global-validation.pipe.js';
import { EventRoutingLegacyKafkaService } from '../../eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { LdapSearchError } from '../adapter/domain/error/ldap-search.error.js';
import { LdapAdapter, PersonData } from '../adapter/domain/ldap.adapter.js';
import { LdapEntityType } from '../adapter/domain/ldap.types.js';
import { LdapModule } from '../ldap.module.js';
import { LdapEventHandler } from './ldap-event-handler.js';

describe('LdapEventHandler', () => {
    let app: INestApplication;
    let orm: MikroORM;

    let ldapEventHandler: LdapEventHandler;
    let ldapClientAdapterMock: DeepMocked<LdapAdapter>;
    let organisationRepositoryMock: DeepMocked<OrganisationRepository>;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let dbiamPersonenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let eventServiceMock: DeepMocked<EventRoutingLegacyKafkaService>;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), LdapModule],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
            ],
        })
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .overrideProvider(LdapAdapter)
            .useValue(createMock(LdapAdapter))
            .overrideProvider(PersonRepository)
            .useValue(createMock(PersonRepository))
            .overrideProvider(PersonenkontextFactory)
            .useClass(PersonenkontextFactory)
            .overrideProvider(RolleRepo)
            .useValue(createMock(RolleRepo))
            .overrideProvider(DBiamPersonenkontextRepo)
            .useValue(createMock(DBiamPersonenkontextRepo))
            .overrideProvider(OrganisationRepository)
            .useValue(createMock(OrganisationRepository))
            .overrideProvider(EventRoutingLegacyKafkaService)
            .useValue(createMock(EventRoutingLegacyKafkaService))
            .compile();

        orm = module.get(MikroORM);

        ldapEventHandler = module.get(LdapEventHandler);
        ldapClientAdapterMock = module.get(LdapAdapter);
        organisationRepositoryMock = module.get(OrganisationRepository);
        personRepositoryMock = module.get(PersonRepository);
        dbiamPersonenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        eventServiceMock = module.get(EventRoutingLegacyKafkaService);
        loggerMock = module.get(ClassLogger);

        await DatabaseTestModule.setupDatabase(module.get(MikroORM));
        app = module.createNestApplication();
        await app.init();
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        vi.resetAllMocks();
        await DatabaseTestModule.clearDatabase(orm);
    });

    describe('handlePersonDeletedEvent', () => {
        describe('when calling LdapClientService.deleteLehrerByUsername is successful', () => {
            it('should NOT log errors', async () => {
                const deletionResult: Result<PersonID> = {
                    ok: true,
                    value: faker.string.uuid(),
                };
                ldapClientAdapterMock.deleteLehrerByUsername.mockResolvedValueOnce(deletionResult);

                await ldapEventHandler.handlePersonDeletedEvent(createMock(PersonDeletedEvent));

                expect(loggerMock.error).toHaveBeenCalledTimes(0);
            });
        });

        describe('when calling LdapClientService.deleteLehrerByUsername is return error', () => {
            it('should log errors', async () => {
                const error: LdapSearchError = new LdapSearchError(LdapEntityType.LEHRER);
                const deletionResult: Result<PersonID> = {
                    ok: false,
                    error: error,
                };
                ldapClientAdapterMock.deleteLehrerByUsername.mockResolvedValueOnce(deletionResult);

                await ldapEventHandler.handlePersonDeletedEvent(createMock(PersonDeletedEvent));

                expect(loggerMock.error).toHaveBeenCalledTimes(1);
                expect(loggerMock.error).toHaveBeenCalledWith(error.message);
            });
        });
    });

    describe('handlePersonDeletedAfterDeadlineExceededEvent', () => {
        describe('when calling LdapClientService.deleteLehrerByUsername is successful', () => {
            it('should NOT log errors', async () => {
                const deletionResult: Result<PersonID> = {
                    ok: true,
                    value: faker.string.uuid(),
                };
                ldapClientAdapterMock.deleteLehrerByUsername.mockResolvedValueOnce(deletionResult);

                await ldapEventHandler.handlePersonDeletedAfterDeadlineExceededEvent(
                    createMock(PersonDeletedAfterDeadlineExceededEvent),
                );

                expect(loggerMock.error).toHaveBeenCalledTimes(0);
            });
        });

        describe('when calling LdapClientService.deleteLehrerByUsername is return error', () => {
            it('should log errors', async () => {
                const error: LdapSearchError = new LdapSearchError(LdapEntityType.LEHRER);
                const deletionResult: Result<PersonID> = {
                    ok: false,
                    error: error,
                };
                ldapClientAdapterMock.deleteLehrerByUsername.mockResolvedValueOnce(deletionResult);

                await ldapEventHandler.handlePersonDeletedAfterDeadlineExceededEvent(
                    createMock(PersonDeletedAfterDeadlineExceededEvent),
                );

                expect(loggerMock.error).toHaveBeenCalledTimes(1);
                expect(loggerMock.error).toHaveBeenCalledWith(error.message);
            });
        });
    });

    describe('microserviceEmailChangedEventHandler', () => {
        let event: EmailMicroserviceAddressChangedEvent;
        let person: Person<true>;

        beforeEach(() => {
            event = new EmailMicroserviceAddressChangedEvent(
                faker.string.uuid(),
                faker.internet.email(),
                faker.internet.email(),
                faker.internet.email(),
                faker.internet.email(),
            );
            person = DoFactory.createPerson(true, { id: event.personId });
        });

        describe('when person can not be found', () => {
            it('should log warning and skip LDAP update', async () => {
                dbiamPersonenkontextRepoMock.hasPersonAnyReadableKontext.mockResolvedValueOnce({
                    ok: true,
                    value: true,
                });
                personRepositoryMock.findById.mockResolvedValueOnce(undefined);

                await ldapEventHandler.microserviceEmailChangedEventHandler(event);

                expect(loggerMock.warning).toHaveBeenCalledWith(
                    `Received EmailMicroserviceAddressChangedEvent for personId:${event.personId}, but person not found or has no username. Skipping LDAP update.`,
                );
                expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledTimes(0);
            });
        });

        describe('when person has no username', () => {
            it('should log warning and skip LDAP update', async () => {
                dbiamPersonenkontextRepoMock.hasPersonAnyReadableKontext.mockResolvedValueOnce({
                    ok: true,
                    value: true,
                });
                personRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createPerson(true, { id: event.personId, username: undefined }),
                );

                await ldapEventHandler.microserviceEmailChangedEventHandler(event);

                expect(loggerMock.warning).toHaveBeenCalledWith(
                    `Received EmailMicroserviceAddressChangedEvent for personId:${event.personId}, but person not found or has no username. Skipping LDAP update.`,
                );
                expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledTimes(0);
            });
        });

        describe('when checking kontexts is not successful', () => {
            it('should log error and skip LDAP update', async () => {
                const error: MissingPermissionsError = new MissingPermissionsError('Access denied');
                const hasAnyKontextsResult: Result<boolean, DomainError> = {
                    ok: false,
                    error: error,
                };

                dbiamPersonenkontextRepoMock.hasPersonAnyReadableKontext.mockResolvedValueOnce(hasAnyKontextsResult);
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                await ldapEventHandler.microserviceEmailChangedEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Received EmailMicroserviceAddressChangedEvent for personId:${event.personId}, username:${person.username}, but failed to check kontexts. Skipping LDAP update.`,
                );
                expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledTimes(0);
            });
        });

        describe('when newPrimaryAddress is UNDEFINED', () => {
            it('should log error and skip LDAP update', async () => {
                event = new EmailMicroserviceAddressChangedEvent(
                    event.personId,
                    undefined,
                    event.newAlternativeAddress,
                    event.previousPrimaryAddress,
                    event.previousAlternativeAddress,
                );
                person = DoFactory.createPerson(true, { id: event.personId });

                dbiamPersonenkontextRepoMock.hasPersonAnyReadableKontext.mockResolvedValueOnce({
                    ok: true,
                    value: true,
                });
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                await ldapEventHandler.microserviceEmailChangedEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Received EmailMicroserviceAddressChangedEvent with empty newPrimaryAddress for personId:${event.personId}, username:${person.username}. Skipping LDAP update.`,
                );
                expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledTimes(0);
            });
        });

        describe('when person has at least one kontext', () => {
            it('should call LdapClientService changeEmailAddressByPersonId', async () => {
                dbiamPersonenkontextRepoMock.hasPersonAnyReadableKontext.mockResolvedValueOnce({
                    ok: true,
                    value: true,
                });
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                await ldapEventHandler.microserviceEmailChangedEventHandler(event);

                expect(dbiamPersonenkontextRepoMock.hasPersonAnyReadableKontext).toHaveBeenCalledWith(
                    event.personId,
                    expect.anything(),
                );
                expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledTimes(1);
                expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledWith(
                    event.personId,
                    person.username,
                    event.newPrimaryAddress,
                    undefined,
                );
            });
        });

        describe('when person has no kontext', () => {
            it('should log info and skip LDAP update', async () => {
                dbiamPersonenkontextRepoMock.hasPersonAnyReadableKontext.mockResolvedValueOnce({
                    ok: true,
                    value: false,
                });
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                await ldapEventHandler.microserviceEmailChangedEventHandler(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Received EmailMicroserviceAddressChangedEvent for personId:${event.personId}, username:${person.username}, but person has no kontext. Skipping LDAP update.`,
                );
                expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledTimes(0);
            });
        });
    });

    describe('handlePersonRenamedEvent', () => {
        describe('when calling LdapClientService.modifyPersonAttributes is successful', () => {
            it('should NOT log errors', async () => {
                const modifyResult: Result<PersonUsername> = {
                    ok: true,
                    value: faker.internet.username(),
                };
                ldapClientAdapterMock.modifyPersonAttributes.mockResolvedValueOnce(modifyResult);
                await ldapEventHandler.personRenamedEventHandler(createMock(PersonRenamedEvent));
                expect(loggerMock.error).toHaveBeenCalledTimes(0);
            });
        });
        describe('when calling LdapClientService.modifyPersonAttributes is not successful', () => {
            it('should log errors', async () => {
                const error: LdapSearchError = new LdapSearchError(LdapEntityType.LEHRER);
                const modifyResult: Result<PersonID> = {
                    ok: false,
                    error: error,
                };
                ldapClientAdapterMock.modifyPersonAttributes.mockResolvedValueOnce(modifyResult);
                await ldapEventHandler.personRenamedEventHandler(createMock(PersonRenamedEvent));
                expect(loggerMock.error).toHaveBeenCalledWith(error.message);
            });
        });
    });

    describe('handlePersonenkontextUpdatedEvent', () => {
        it('should call ldap client for every new personenkontext with correct role', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.EXTERN,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [],
                [],
            );

            organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce('schule-sh.de');

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(ldapClientAdapterMock.createLehrer).toHaveBeenCalledTimes(1);
        });

        it('when organisation of created PK has no valid emailDomain should log error', async () => {
            const createdPKOrgaId: string = faker.string.uuid();
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: createdPKOrgaId,
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.EXTERN,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [],
                [],
            );

            organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce(undefined);

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(loggerMock.error).toHaveBeenLastCalledWith(
                `LdapClientService createLehrer NOT called, because organisation:${createdPKOrgaId} has no valid emailDomain`,
            );
            expect(ldapClientAdapterMock.createLehrer).toHaveBeenCalledTimes(0);
        });

        it('should call ldap client for every deleted personenkontext with correct role (if person has PK with rollenArt LEHR left)', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [],
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.EXTERN,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [],
            );

            organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce('schule-sh.de');

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(ldapClientAdapterMock.removePersonFromGroupByUsernameAndKennung).toHaveBeenCalledTimes(1);
        });

        it('should NOT call ldap client for deleting person in LDAP when person still has at least one PK with rollenArt LEHR left', async () => {
            const fakeOrgaID: string = faker.string.uuid();
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [],
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: fakeOrgaID,
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: fakeOrgaID,
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
            );

            organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce('schule-sh.de');
            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);
            expect(ldapClientAdapterMock.deleteLehrer).toHaveBeenCalledTimes(0);
        });

        it('when organisation of deleted PK has no valid emailDomain should log error', async () => {
            const removedOrgaId: string = faker.string.uuid();
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [],
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: removedOrgaId,
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.EXTERN,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [],
            );

            organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce(undefined);

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(loggerMock.error).toHaveBeenLastCalledWith(
                `LdapClientService removePersonFromGroup NOT called, because organisation:${removedOrgaId} has no valid emailDomain`,
            );
            expect(ldapClientAdapterMock.deleteLehrer).toHaveBeenCalledTimes(0);
        });

        describe('when ldap client fails', () => {
            it('should execute without errors, if creation of lehrer fails', async () => {
                const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                    {
                        id: faker.string.uuid(),
                        vorname: faker.person.firstName(),
                        familienname: faker.person.lastName(),
                        username: faker.internet.username(),
                    },
                    [
                        {
                            id: faker.string.uuid(),
                            orgaId: faker.string.uuid(),
                            rolle: RollenArt.LEHR,
                            rolleId: faker.string.uuid(),
                            orgaKennung: faker.string.numeric(7),
                            isItslearningOrga: false,
                            serviceProviderExternalSystems: [],
                        },
                    ],
                    [],
                    [],
                );
                ldapClientAdapterMock.createLehrer.mockResolvedValueOnce({ ok: false, error: new Error('Error') });

                organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce('schule-sh.de');

                await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

                expect(ldapClientAdapterMock.createLehrer).toHaveBeenCalledTimes(1);
            });
        });

        it('should execute without errors, if removePersonFromGroup fails', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [],
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [],
            );
            ldapClientAdapterMock.removePersonFromGroupByUsernameAndKennung.mockResolvedValueOnce({
                ok: false,
                error: new Error('Error'),
            });

            organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce('schule-sh.de');

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(ldapClientAdapterMock.removePersonFromGroupByUsernameAndKennung).toHaveBeenCalledTimes(1);
        });

        it('should log an error when a removed personenkontext has no orgaKennung', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [],
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: undefined,
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [],
            );

            organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce('schule-sh.de');
            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);
            expect(ldapClientAdapterMock.deleteLehrer).toHaveBeenCalledTimes(0);
        });

        it('should log an error when a new personenkontext has no orgaKennung', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: undefined,
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [],
                [],
            );

            organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce('schule-sh.de');

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);
            expect(ldapClientAdapterMock.createLehrer).toHaveBeenCalledTimes(0);
        });

        it('should log error when error occurs in removePersonFromGroupByUsernameAndKennung', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [],
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.EXTERN,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [],
            );

            organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce('schule-sh.de');
            ldapClientAdapterMock.removePersonFromGroupByUsernameAndKennung.mockRejectedValueOnce(
                new Error('removePersonFromGroup error'),
            );

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(loggerMock.error).toHaveBeenCalledTimes(1);
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Error in removePersonFromGroup:'));
        });

        it('should log error when error occurs while getEmailDomainForOrganisationId deleting person', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [],
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.EXTERN,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [],
            );

            organisationRepositoryMock.findEmailDomainForOrganisation.mockRejectedValueOnce(new Error('Test'));

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(loggerMock.error).toHaveBeenCalledTimes(1);
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining('Error in getEmailDomainForOrganisationId:'),
            );
        });

        it('should log error when error occurs while create Lehrer', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.EXTERN,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [],
                [],
            );

            organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce('schule-sh.de');
            ldapClientAdapterMock.createLehrer.mockRejectedValueOnce(new Error('createLehrer error'));

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(loggerMock.error).toHaveBeenCalledTimes(1);
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Error in createLehrer:'));
        });

        it('should log error when error occurs while getEmailDomainForOrganisationId adding person', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.EXTERN,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [],
                [],
            );

            organisationRepositoryMock.findEmailDomainForOrganisation.mockRejectedValueOnce(new Error('Test'));

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(loggerMock.error).toHaveBeenCalledTimes(1);
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining('Error in getEmailDomainForOrganisationId:'),
            );
        });

        it('should persist entryUUID to database', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.EXTERN,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [],
                [],
            );

            const entryUUID: string = faker.string.uuid();

            organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce('schule-sh.de');
            ldapClientAdapterMock.createLehrer.mockResolvedValueOnce({
                ok: true,
                value: {
                    ldapEntryUUID: entryUUID,
                } as PersonData,
            });

            personRepositoryMock.findById.mockResolvedValueOnce(DoFactory.createPerson(true));

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(personRepositoryMock.save).toHaveBeenCalledTimes(1);
        });

        it('should log error if person can not be found', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.LEHR,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                    {
                        id: faker.string.uuid(),
                        orgaId: faker.string.uuid(),
                        rolle: RollenArt.EXTERN,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
                [],
                [],
            );

            const entryUUID: string = faker.string.uuid();

            organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce('schule-sh.de');
            ldapClientAdapterMock.createLehrer.mockResolvedValueOnce({
                ok: true,
                value: {
                    ldapEntryUUID: entryUUID,
                } as PersonData,
            });

            personRepositoryMock.findById.mockResolvedValueOnce(undefined);

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(personRepositoryMock.save).toHaveBeenCalledTimes(0);
            expect(loggerMock.error).toHaveBeenCalledWith(
                `LdapClientService createLehrer could not find person with id:${event.person.id}, ref:${event.person.username}`,
            );
        });
    });

    describe('handleEmailAddressGeneratedEvent', () => {
        it('should call ldap client changeEmailAddressByPersonId', async () => {
            const event: EmailAddressGeneratedEvent = new EmailAddressGeneratedEvent(
                faker.string.uuid(),
                faker.internet.username(),
                faker.string.uuid(),
                faker.internet.email(),
                true,
                faker.string.numeric(),
            );

            await ldapEventHandler.handleEmailAddressGeneratedEvent(event);

            expect(loggerMock.info).toHaveBeenLastCalledWith(
                `Received EmailAddressGeneratedEvent, personId:${event.personId}, username:${event.username}, emailAddress:${event.address}`,
            );
            expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledTimes(1);
        });
    });

    describe('handleEmailAddressChangedEvent', () => {
        it('should call LdapClientService changeEmailAddressByPersonId', async () => {
            const event: EmailAddressChangedEvent = new EmailAddressChangedEvent(
                faker.string.uuid(),
                faker.internet.username(),
                faker.string.uuid(),
                faker.internet.email(),
                faker.string.uuid(),
                faker.internet.email(),
                faker.string.numeric(),
            );

            await ldapEventHandler.handleEmailAddressChangedEvent(event);

            expect(loggerMock.info).toHaveBeenLastCalledWith(
                `Received EmailAddressChangedEvent, personId:${event.personId}, newEmailAddress:${event.newAddress}, oldEmailAddress:${event.oldAddress}`,
            );
            expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledTimes(1);
        });
    });

    describe('handleEmailAddressMarkedForDeletionEvent', () => {
        let personId: PersonID;
        let username: PersonUsername;
        let address: string;

        beforeEach(() => {
            personId = faker.string.uuid();
            username = faker.internet.username();
            address = faker.internet.email();
        });
        describe('when username is UNDEFINED in event', () => {
            it('should NOT call LdapClientService removeMailAlternativeAddress and instead publish LdapEmailAddressDeletedEvent directly', async () => {
                const event: EmailAddressMarkedForDeletionEvent = new EmailAddressMarkedForDeletionEvent(
                    personId,
                    undefined,
                    faker.string.numeric(),
                    faker.string.uuid(),
                    EmailAddressStatus.DISABLED,
                    address,
                );

                await ldapEventHandler.handleEmailAddressMarkedForDeletionEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Received EmailAddressDeletedEvent, personId:${event.personId}, username:${event.username}, address:${event.address}`,
                );
                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Username UNDEFINED in EmailAddressDeletedEvent, skipping removal of MailAlternativeAddress in LDAP, oxUserId:${event.oxUserId}`,
                );
                expect(ldapClientAdapterMock.removeMailAlternativeAddress).toHaveBeenCalledTimes(0);
                expect(eventServiceMock.publish).toHaveBeenCalledWith(
                    expect.objectContaining({
                        personId: personId,
                        username: undefined,
                        address: address,
                    }),
                    expect.objectContaining({
                        personId: personId,
                        username: undefined,
                        address: address,
                    }),
                );
            });
        });

        describe('when username is defined in event', () => {
            it('should call LdapClientService removeMailAlternativeAddress', async () => {
                const event: EmailAddressMarkedForDeletionEvent = new EmailAddressMarkedForDeletionEvent(
                    personId,
                    username,
                    faker.string.numeric(),
                    faker.string.uuid(),
                    EmailAddressStatus.DISABLED,
                    address,
                );
                ldapClientAdapterMock.removeMailAlternativeAddress.mockResolvedValueOnce({ ok: true, value: true });
                await ldapEventHandler.handleEmailAddressMarkedForDeletionEvent(event);

                expect(loggerMock.info).toHaveBeenLastCalledWith(
                    `Received EmailAddressDeletedEvent, personId:${event.personId}, username:${event.username}, address:${event.address}`,
                );
                expect(ldapClientAdapterMock.removeMailAlternativeAddress).toHaveBeenCalledTimes(1);
                expect(eventServiceMock.publish).toHaveBeenCalledWith(
                    expect.objectContaining({
                        personId: personId,
                        username: username,
                        address: address,
                    }),
                    expect.objectContaining({
                        personId: personId,
                        username: username,
                        address: address,
                    }),
                );
            });
        });
    });

    describe('handleEmailAddressesPurgedEvent', () => {
        const personId: PersonID = faker.string.uuid();
        const username: PersonUsername = faker.internet.username();

        it('should log error when username is UNDEFINED in event', async () => {
            const event: EmailAddressesPurgedEvent = new EmailAddressesPurgedEvent(
                personId,
                undefined,
                faker.string.numeric(),
            );
            await ldapEventHandler.handleEmailAddressesPurgedEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                `Received EmailAddressesPurgedEvent, personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}`,
            );
            expect(loggerMock.info).toHaveBeenLastCalledWith(
                `Cannot delete lehrer by username, username is UNDEFINED, oxUserId:${event.oxUserId}`,
            );
            expect(ldapClientAdapterMock.deleteLehrerByUsername).toHaveBeenCalledTimes(0);
            expect(eventServiceMock.publish).toHaveBeenCalledTimes(0);
        });

        it('should call LdapClientService deleteLehrerByUsername', async () => {
            const event: EmailAddressesPurgedEvent = new EmailAddressesPurgedEvent(
                personId,
                username,
                faker.string.numeric(),
            );
            ldapClientAdapterMock.deleteLehrerByUsername.mockResolvedValueOnce({
                ok: true,
                value: personId,
            });
            await ldapEventHandler.handleEmailAddressesPurgedEvent(event);

            expect(loggerMock.info).toHaveBeenLastCalledWith(
                `Received EmailAddressesPurgedEvent, personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}`,
            );
            expect(ldapClientAdapterMock.deleteLehrerByUsername).toHaveBeenCalledTimes(1);
            expect(eventServiceMock.publish).toHaveBeenCalledWith(
                expect.objectContaining({
                    personId: personId,
                    username: username,
                }),
                expect.objectContaining({
                    personId: personId,
                    username: username,
                }),
            );
        });

        it('should call LdapClientService deleteLehrerByUsername and log error if result is NOT ok', async () => {
            const error: LdapSearchError = new LdapSearchError(LdapEntityType.LEHRER);
            const event: EmailAddressesPurgedEvent = new EmailAddressesPurgedEvent(
                personId,
                username,
                faker.string.numeric(),
            );
            ldapClientAdapterMock.deleteLehrerByUsername.mockResolvedValueOnce({
                ok: false,
                error: error,
            });
            await ldapEventHandler.handleEmailAddressesPurgedEvent(event);

            expect(loggerMock.info).toHaveBeenLastCalledWith(
                `Received EmailAddressesPurgedEvent, personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}`,
            );
            expect(ldapClientAdapterMock.deleteLehrerByUsername).toHaveBeenCalledTimes(1);
            expect(loggerMock.error).toHaveBeenLastCalledWith(error.message);
            expect(eventServiceMock.publish).toHaveBeenCalledTimes(0);
        });
    });

    describe('handleOrganisationDeletedEvent', () => {
        let orga: Organisation<true>;

        const getReceivedLogMessage: (event: OrganisationDeletedEvent) => string = (event: OrganisationDeletedEvent) =>
            `Received OrganisationDeletedEvent, organisationId:${event.organisationId}, name:${event.name}, kennung:${event.kennung}, typ:${event.typ}`;
        const getCantDeleteLogMessage: (event: OrganisationDeletedEvent) => string = (
            event: OrganisationDeletedEvent,
        ) =>
            `Cannot delete organisation, since typ is not ${OrganisationsTyp.SCHULE} or kennung is UNDEFINED, organisationId:${event.organisationId}, kennung:${event.kennung}, typ:${event.typ}`;

        beforeEach(() => {
            orga = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            ldapClientAdapterMock.deleteOrganisation.mockResolvedValue(Ok(orga.kennung!));
        });

        describe('when event is complete', () => {
            it('should log and return true', async () => {
                const event: OrganisationDeletedEvent = OrganisationDeletedEvent.fromOrganisation(orga);

                await expect(ldapEventHandler.handleOrganisationDeletedEvent(event)).resolves.toEqual(Ok(orga.kennung));
                expect(loggerMock.info).toHaveBeenLastCalledWith(getReceivedLogMessage(event));
                expect(ldapClientAdapterMock.deleteOrganisation).toHaveBeenLastCalledWith(orga.kennung);
            });
        });

        describe.each([['typ'], ['kennung']] as Array<Array<keyof OrganisationDeletedEvent>>)(
            'when event is missing %s',
            (missingPropertyKey: keyof OrganisationDeletedEvent) => {
                it('should return without calling the service', async () => {
                    const event: OrganisationDeletedEvent = OrganisationDeletedEvent.fromOrganisation(orga);
                    delete event[missingPropertyKey];

                    await expect(ldapEventHandler.handleOrganisationDeletedEvent(event)).resolves.toEqual(
                        Ok(undefined),
                    );
                    expect(loggerMock.info).toHaveBeenCalledWith(getReceivedLogMessage(event));
                    expect(loggerMock.info).toHaveBeenLastCalledWith(getCantDeleteLogMessage(event));
                    expect(ldapClientAdapterMock.deleteOrganisation).not.toHaveBeenCalled();
                });
            },
        );

        describe(`when orga.typ is not ${OrganisationsTyp.SCHULE}`, () => {
            it('should return without calling the service', async () => {
                const event: OrganisationDeletedEvent = OrganisationDeletedEvent.fromOrganisation({
                    ...orga,
                    typ: OrganisationsTyp.LAND,
                });

                await expect(ldapEventHandler.handleOrganisationDeletedEvent(event)).resolves.toEqual(Ok(undefined));
                expect(loggerMock.info).toHaveBeenCalledWith(getReceivedLogMessage(event));
                expect(loggerMock.info).toHaveBeenLastCalledWith(getCantDeleteLogMessage(event));
                expect(ldapClientAdapterMock.deleteOrganisation).not.toHaveBeenCalled();
            });
        });
    });
});
