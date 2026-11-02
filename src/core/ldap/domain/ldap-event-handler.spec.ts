import { faker } from '@faker-js/faker';
import { type INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';

import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { DatabaseTestModule, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS, DoFactory } from '../../../../test/utils/index.js';
import { OrganisationsTyp } from '../../../modules/organisation/domain/organisation.enums.js';
import { type Organisation } from '../../../modules/organisation/domain/organisation.js';
import { OrganisationRepository } from '../../../modules/organisation/persistence/organisation.repository.js';
import { type Person } from '../../../modules/person/domain/person.js';
import { PersonRepository } from '../../../modules/person/persistence/person.repository.js';
import { PersonenkontextFactory } from '../../../modules/personenkontext/domain/personenkontext.factory.js';
import { type Personenkontext } from '../../../modules/personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../../../modules/personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../../modules/rolle/domain/rolle.enums.js';
import { type Rolle } from '../../../modules/rolle/domain/rolle.js';
import { RolleRepo } from '../../../modules/rolle/repo/rolle.repo.js';
import { ServiceProviderSystem } from '../../../modules/service-provider/domain/service-provider.enum.js';
import { EmailMicroserviceAddressChangedEvent } from '../../../shared/events/email-microservice/email-microservice-address-changed.event.js';
import { OrganisationDeletedEvent } from '../../../shared/events/organisation-deleted.event.js';
import { PersonDeletedAfterDeadlineExceededEvent } from '../../../shared/events/person-deleted-after-deadline-exceeded.event.js';
import { PersonDeletedEvent } from '../../../shared/events/person-deleted.event.js';
import { PersonRenamedEvent } from '../../../shared/events/person-renamed-event.js';
import { PersonenkontextUpdatedEvent } from '../../../shared/events/personenkontext-updated.event.js';
import { type PersonID, type PersonUsername } from '../../../shared/types/aggregate-ids.types.js';
import { Ok } from '../../../shared/util/result.js';
import { GlobalValidationPipe } from '../../../shared/validation/global-validation.pipe.js';
import { EventRoutingLegacyKafkaService } from '../../eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { LdapModifyEmailError } from '../adapter/domain/error/ldap-modify-email.error.js';
import { LdapSearchError } from '../adapter/domain/error/ldap-search.error.js';
import { LdapAdapter, type LdapPersonAttributes, type PersonData } from '../adapter/domain/ldap.adapter.js';
import { LdapEntityType } from '../adapter/domain/ldap.types.js';
import { LdapEventHandler } from './ldap-event-handler.js';

describe('LdapEventHandler', () => {
    let app: INestApplication;

    let ldapEventHandler: LdapEventHandler;
    let ldapClientAdapterMock: DeepMocked<LdapAdapter>;
    let organisationRepositoryMock: DeepMocked<OrganisationRepository>;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let dbiamPersonenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let eventServiceMock: DeepMocked<EventRoutingLegacyKafkaService>;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: false })],
            providers: [
                LdapEventHandler,
                PersonenkontextFactory,
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                {
                    provide: LdapAdapter,
                    useValue: createMock(LdapAdapter),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
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
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: EventRoutingLegacyKafkaService,
                    useValue: createMock(EventRoutingLegacyKafkaService),
                },
            ],
        }).compile();

        ldapEventHandler = module.get(LdapEventHandler);
        ldapClientAdapterMock = module.get(LdapAdapter);
        organisationRepositoryMock = module.get(OrganisationRepository);
        personRepositoryMock = module.get(PersonRepository);
        dbiamPersonenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        rolleRepoMock = module.get(RolleRepo);
        eventServiceMock = module.get(EventRoutingLegacyKafkaService);
        loggerMock = module.get(ClassLogger);

        app = module.createNestApplication();
        await app.init();
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
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
            const username: PersonUsername = 'email-teacher';
            event = new EmailMicroserviceAddressChangedEvent(
                faker.string.uuid(),
                faker.internet.email(),
                faker.internet.email(),
                faker.internet.email(),
                faker.internet.email(),
            );
            person = DoFactory.createPerson(true, { id: event.personId, username });
            ldapClientAdapterMock.findPersonByUsername.mockResolvedValue(
                Ok({ uid: username, dn: `uid=${username},dc=schule-sh,dc=de` }),
            );
            ldapClientAdapterMock.changeEmailAddressByPersonId.mockResolvedValue(Ok(event.personId));
        });

        describe('when person can not be found', () => {
            it('should log warning and skip LDAP update', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(undefined);

                await ldapEventHandler.microserviceEmailChangedEventHandler(event);

                expect(loggerMock.warning).toHaveBeenCalledWith(
                    `Received EmailMicroserviceAddressChangedEvent for personId:${event.personId}, but person not found or has no username. Skipping LDAP update.`,
                );
                expect(ldapClientAdapterMock.findPersonByUsername).not.toHaveBeenCalled();
                expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledTimes(0);
            });
        });

        describe('when person has no username', () => {
            it('should log warning and skip LDAP update', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createPerson(true, { id: event.personId, username: undefined }),
                );

                await ldapEventHandler.microserviceEmailChangedEventHandler(event);

                expect(loggerMock.warning).toHaveBeenCalledWith(
                    `Received EmailMicroserviceAddressChangedEvent for personId:${event.personId}, but person not found or has no username. Skipping LDAP update.`,
                );
                expect(ldapClientAdapterMock.findPersonByUsername).not.toHaveBeenCalled();
                expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledTimes(0);
            });
        });

        describe('when the LDAP lookup is not successful', () => {
            it('should log error and skip LDAP update', async () => {
                const error: LdapSearchError = new LdapSearchError(LdapEntityType.LEHRER);
                ldapClientAdapterMock.findPersonByUsername.mockResolvedValueOnce({ ok: false, error });
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                await ldapEventHandler.microserviceEmailChangedEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(error.message);
                expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledTimes(0);
            });
        });

        describe.each([undefined, ''])('when newPrimaryAddress is %s', (newPrimaryAddress: string | undefined) => {
            it('should log error and skip LDAP update', async () => {
                event = new EmailMicroserviceAddressChangedEvent(
                    event.personId,
                    newPrimaryAddress,
                    event.newAlternativeAddress,
                    event.previousPrimaryAddress,
                    event.previousAlternativeAddress,
                );
                person = DoFactory.createPerson(true, { id: event.personId });

                personRepositoryMock.findById.mockResolvedValueOnce(person);

                await ldapEventHandler.microserviceEmailChangedEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Received EmailMicroserviceAddressChangedEvent with empty newPrimaryAddress for personId:${event.personId}, username:${person.username}. Skipping LDAP update.`,
                );
                expect(ldapClientAdapterMock.findPersonByUsername).not.toHaveBeenCalled();
                expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledTimes(0);
            });
        });

        describe('when person has at least one kontext', () => {
            it('should call LdapClientService changeEmailAddressByPersonId', async () => {
                const rolle: Rolle<true> = DoFactory.createRolle(true, {
                    serviceProviderData: [
                        DoFactory.createServiceProvider(true, { externalSystem: ServiceProviderSystem.UEM }),
                    ],
                });
                const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    personId: event.personId,
                    rolleId: rolle.id,
                });
                dbiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
                rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolle.id, rolle]]));
                organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('oeffentlicheSchulen');
                dbiamPersonenkontextRepoMock.hasPersonAnyReadableKontext.mockResolvedValueOnce({
                    ok: true,
                    value: true,
                });
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                await ldapEventHandler.microserviceEmailChangedEventHandler(event);

                expect(ldapClientAdapterMock.findPersonByUsername).toHaveBeenCalledWith(
                    event.personId,
                    person.username,
                );
                expect(dbiamPersonenkontextRepoMock.hasPersonAnyReadableKontext).not.toHaveBeenCalled();
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
            it('should update the email if the person exists in LDAP', async () => {
                dbiamPersonenkontextRepoMock.hasPersonAnyReadableKontext.mockResolvedValueOnce({
                    ok: true,
                    value: false,
                });
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                await ldapEventHandler.microserviceEmailChangedEventHandler(event);

                expect(ldapClientAdapterMock.findPersonByUsername).toHaveBeenCalledWith(
                    event.personId,
                    person.username,
                );
                expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledWith(
                    event.personId,
                    person.username,
                    event.newPrimaryAddress,
                    undefined,
                );
                expect(dbiamPersonenkontextRepoMock.hasPersonAnyReadableKontext).not.toHaveBeenCalled();
                expect(dbiamPersonenkontextRepoMock.findByPerson).not.toHaveBeenCalled();
                expect(loggerMock.error).not.toHaveBeenCalled();
            });
        });

        it('should update the email when the LDAP person has no UEM role', async () => {
            dbiamPersonenkontextRepoMock.hasPersonAnyReadableKontext.mockResolvedValueOnce(Ok(true));
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            const rolle: Rolle<true> = DoFactory.createRolle(true, { serviceProviderData: [] });
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, { rolleId: rolle.id });
            dbiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolle.id, rolle]]));

            await ldapEventHandler.microserviceEmailChangedEventHandler(event);

            expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledWith(
                event.personId,
                person.username,
                event.newPrimaryAddress,
                undefined,
            );
            expect(dbiamPersonenkontextRepoMock.findByPerson).not.toHaveBeenCalled();
            expect(rolleRepoMock.findByIds).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.findUemLdapOuForOrganisation).not.toHaveBeenCalled();
        });

        it('should update the email when the LDAP person has no configured UEM LDAP OU', async () => {
            dbiamPersonenkontextRepoMock.hasPersonAnyReadableKontext.mockResolvedValueOnce(Ok(true));
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, { externalSystem: ServiceProviderSystem.UEM }),
                ],
            });
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, { rolleId: rolle.id });
            dbiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolle.id, rolle]]));
            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce(undefined);

            await ldapEventHandler.microserviceEmailChangedEventHandler(event);

            expect(ldapClientAdapterMock.changeEmailAddressByPersonId).toHaveBeenCalledWith(
                event.personId,
                person.username,
                event.newPrimaryAddress,
                undefined,
            );
            expect(organisationRepositoryMock.findUemLdapOuForOrganisation).not.toHaveBeenCalled();
        });

        it('should skip the email update when the person is not in LDAP', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            ldapClientAdapterMock.findPersonByUsername.mockResolvedValueOnce(Ok(null));

            await ldapEventHandler.microserviceEmailChangedEventHandler(event);

            expect(ldapClientAdapterMock.findPersonByUsername).toHaveBeenCalledWith(event.personId, person.username);
            expect(loggerMock.info).toHaveBeenCalledWith(
                `No LDAP entry found for personId:${event.personId}, username:${person.username}. Skipping LDAP email update.`,
            );
            expect(ldapClientAdapterMock.changeEmailAddressByPersonId).not.toHaveBeenCalled();
        });

        it('should log email update errors', async () => {
            const error: LdapModifyEmailError = new LdapModifyEmailError();
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            ldapClientAdapterMock.changeEmailAddressByPersonId.mockResolvedValueOnce({ ok: false, error });

            await ldapEventHandler.microserviceEmailChangedEventHandler(event);

            expect(loggerMock.error).toHaveBeenCalledWith(error.message);
        });
    });

    describe('handlePersonRenamedEvent', () => {
        const event: PersonRenamedEvent = new PersonRenamedEvent(
            'person-id',
            'Renamed',
            'Teachername',
            'renamed-teacher',
            'Original',
            'Teacher',
            'original-teacher',
        );
        const ldapPerson: LdapPersonAttributes = {
            uid: event.oldUsername,
            dn: `uid=${event.oldUsername},dc=schule-sh,dc=de`,
        };

        it('should skip LDAP update when the person is not in LDAP', async () => {
            ldapClientAdapterMock.findPersonByUsername.mockResolvedValueOnce(Ok(null));

            const result: Result<unknown> = await ldapEventHandler.personRenamedEventHandler(event);

            expect(result).toEqual(Ok());
            expect(ldapClientAdapterMock.findPersonByUsername).toHaveBeenCalledWith(event.personId, event.oldUsername);
            expect(ldapClientAdapterMock.modifyPersonAttributes).not.toHaveBeenCalled();
            expect(eventServiceMock.publish).not.toHaveBeenCalled();
        });

        it('should log and return LDAP lookup errors without renaming or publishing', async () => {
            const error: LdapSearchError = new LdapSearchError(LdapEntityType.LEHRER);
            const lookupResult: Result<LdapPersonAttributes | null> = { ok: false, error };
            ldapClientAdapterMock.findPersonByUsername.mockResolvedValueOnce(lookupResult);

            const result: Result<unknown> = await ldapEventHandler.personRenamedEventHandler(event);

            expect(result).toEqual(lookupResult);
            expect(loggerMock.error).toHaveBeenCalledWith(error.message);
            expect(ldapClientAdapterMock.modifyPersonAttributes).not.toHaveBeenCalled();
            expect(eventServiceMock.publish).not.toHaveBeenCalled();
        });

        it('should rename an existing LDAP person without UEM kontexts', async () => {
            const modifyResult: Result<PersonUsername> = Ok('renamed-teacher');
            dbiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([]);
            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map());
            ldapClientAdapterMock.findPersonByUsername.mockResolvedValueOnce(Ok(ldapPerson));
            ldapClientAdapterMock.modifyPersonAttributes.mockResolvedValueOnce(modifyResult);

            const result: Result<unknown> = await ldapEventHandler.personRenamedEventHandler(event);

            expect(result).toEqual(modifyResult);
            expect(ldapClientAdapterMock.findPersonByUsername).toHaveBeenCalledWith(event.personId, event.oldUsername);
            expect(ldapClientAdapterMock.modifyPersonAttributes).toHaveBeenCalledWith(
                event.oldUsername,
                event.vorname,
                event.familienname,
                event.username,
            );
            expect(dbiamPersonenkontextRepoMock.findByPerson).not.toHaveBeenCalled();
            expect(rolleRepoMock.findByIds).not.toHaveBeenCalled();
            expect(loggerMock.error).not.toHaveBeenCalled();
            expect(eventServiceMock.publish).toHaveBeenCalledTimes(1);
        });

        it('should log and return rename errors without publishing', async () => {
            const error: LdapSearchError = new LdapSearchError(LdapEntityType.LEHRER);
            const modifyResult: Result<PersonUsername> = { ok: false, error };
            ldapClientAdapterMock.findPersonByUsername.mockResolvedValueOnce(Ok(ldapPerson));
            ldapClientAdapterMock.modifyPersonAttributes.mockResolvedValueOnce(modifyResult);

            const result: Result<unknown> = await ldapEventHandler.personRenamedEventHandler(event);

            expect(result).toEqual(modifyResult);
            expect(loggerMock.error).toHaveBeenCalledWith(error.message);
            expect(eventServiceMock.publish).not.toHaveBeenCalled();
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
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

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(ldapClientAdapterMock.createLehrer).toHaveBeenCalledTimes(1);
        });

        it('when organisation of created PK has no valid LDAP OU should log error', async () => {
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
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

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce(undefined);

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(loggerMock.error).toHaveBeenLastCalledWith(
                `LdapClientService createLehrer NOT called, because organisation:${createdPKOrgaId} has no valid uemLdapOu`,
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
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

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');

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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
                    },
                ],
            );

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');
            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);
            expect(ldapClientAdapterMock.deleteLehrer).toHaveBeenCalledTimes(0);
        });

        it('should call ldap client to remove person from group when remaining PK at same organisation does NOT have UEM', async () => {
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
                    },
                ],
                [
                    {
                        id: faker.string.uuid(),
                        orgaId: fakeOrgaID,
                        rolle: RollenArt.EXTERN,
                        rolleId: faker.string.uuid(),
                        orgaKennung: faker.string.numeric(7),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
            );

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');
            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);
            expect(ldapClientAdapterMock.removePersonFromGroupByUsernameAndKennung).toHaveBeenCalledTimes(1);
        });

        it('when organisation of deleted PK has no valid LDAP OU should log error', async () => {
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
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

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce(undefined);

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(loggerMock.error).toHaveBeenLastCalledWith(
                `LdapClientService removePersonFromGroup NOT called, because organisation:${removedOrgaId} has no valid uemLdapOu`,
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
                            serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
                        },
                    ],
                    [],
                    [],
                );
                ldapClientAdapterMock.createLehrer.mockResolvedValueOnce({ ok: false, error: new Error('Error') });

                organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');

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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
                    },
                ],
                [],
            );
            ldapClientAdapterMock.removePersonFromGroupByUsernameAndKennung.mockResolvedValueOnce({
                ok: false,
                error: new Error('Error'),
            });

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');

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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
                    },
                ],
                [],
            );

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
                    },
                ],
                [],
                [],
            );

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');

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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
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

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');
            ldapClientAdapterMock.removePersonFromGroupByUsernameAndKennung.mockRejectedValueOnce(
                new Error('removePersonFromGroup error'),
            );

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(loggerMock.error).toHaveBeenCalledTimes(1);
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Error in removePersonFromGroup:'));
        });

        it('should return an accumulated failure when getting the LDAP OU for a deleted context rejects', async () => {
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
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

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockRejectedValueOnce(new Error('Test'));

            const result: Result<unknown> = await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain('Test');
            }
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
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

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');
            ldapClientAdapterMock.createLehrer.mockRejectedValueOnce(new Error('createLehrer error'));

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(loggerMock.error).toHaveBeenCalledTimes(1);
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Error in createLehrer:'));
        });

        it('should return an accumulated failure when getting the LDAP OU for a new context rejects', async () => {
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
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

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockRejectedValueOnce(new Error('Test'));

            const result: Result<unknown> = await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain('Test');
            }
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
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

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
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

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');
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

        it('should stringify a non-Error thrown in removePersonFromGroupByUsernameAndKennung', async () => {
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
                    },
                ],
                [],
            );

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');
            ldapClientAdapterMock.removePersonFromGroupByUsernameAndKennung.mockRejectedValueOnce('non-error reason');

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining('Error in removePersonFromGroup: non-error reason'),
            );
        });

        it('should stringify a non-Error thrown in createLehrer', async () => {
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
                    },
                ],
                [],
                [],
            );

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');
            ldapClientAdapterMock.createLehrer.mockRejectedValueOnce('non-error reason');

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining('Error in createLehrer: non-error reason'),
            );
        });

        it('should include a non-Error rejection in the accumulated failure', async () => {
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
                    },
                ],
                [],
                [],
            );

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockRejectedValueOnce('non-error reason');

            const result: Result<unknown> = await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain('non-error reason');
            }
        });

        it('should not persist entryUUID when createLehrer returns no ldapEntryUUID', async () => {
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
                        serviceProviderExternalSystems: [ServiceProviderSystem.UEM],
                    },
                ],
                [],
                [],
            );

            organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('schule-sh.de');
            ldapClientAdapterMock.createLehrer.mockResolvedValueOnce({
                ok: true,
                value: {} as PersonData,
            });
            personRepositoryMock.findById.mockResolvedValueOnce(DoFactory.createPerson(true));

            await ldapEventHandler.handlePersonenkontextUpdatedEvent(event);

            expect(personRepositoryMock.save).toHaveBeenCalledTimes(0);
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
            ldapClientAdapterMock.organisationExists.mockResolvedValue(Ok(true));
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

        describe('when organisation does not exist', () => {
            it('should return without calling the service', async () => {
                ldapClientAdapterMock.organisationExists.mockResolvedValue(Ok(false));
                const event: OrganisationDeletedEvent = OrganisationDeletedEvent.fromOrganisation(orga);

                await expect(ldapEventHandler.handleOrganisationDeletedEvent(event)).resolves.toEqual(Ok(undefined));
                expect(loggerMock.info).toHaveBeenCalledWith(getReceivedLogMessage(event));
                expect(ldapClientAdapterMock.deleteOrganisation).not.toHaveBeenCalled();
            });
        });

        describe('when checking organisation existence fails', () => {
            it('should return the error without calling the service', async () => {
                const error: LdapSearchError = new LdapSearchError(LdapEntityType.LEHRER);
                ldapClientAdapterMock.organisationExists.mockResolvedValue({ ok: false, error });
                const event: OrganisationDeletedEvent = OrganisationDeletedEvent.fromOrganisation(orga);

                await expect(ldapEventHandler.handleOrganisationDeletedEvent(event)).resolves.toEqual({
                    ok: false,
                    error,
                });
                expect(loggerMock.info).toHaveBeenCalledWith(getReceivedLogMessage(event));
                expect(ldapClientAdapterMock.deleteOrganisation).not.toHaveBeenCalled();
            });
        });
    });
});
