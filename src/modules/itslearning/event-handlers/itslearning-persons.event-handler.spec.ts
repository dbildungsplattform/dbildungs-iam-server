import { vi, type Mock } from 'vitest';
import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';

import { ConfigTestModule, DatabaseTestModule, DoFactory, LoggingTestModule } from '../../../../test/utils/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { type DomainError } from '../../../shared/error/domain.error.js';
import { ItsLearningError } from '../../../shared/error/its-learning.error.js';
import { OxUserChangedEvent } from '../../../shared/events/ox/ox-user-changed.event.js';
import { PersonRenamedEvent } from '../../../shared/events/person-renamed-event.js';
import {
    type PersonenkontextUpdatedData,
    PersonenkontextUpdatedEvent,
    type PersonenkontextUpdatedPersonData,
} from '../../../shared/events/personenkontext-updated.event.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type Person } from '../../person/domain/person.js';
import {
    DBiamPersonenkontextRepo,
    type ErweiterterServiceProviderForPK,
} from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { type PersonResponse } from '../adapter/technical/actions/read-person.action.js';
import {
    ItslearningMembershipAdapter,
    type SetMembershipsResult,
} from '../adapter/domain/itslearning-membership.adapter.js';
import { ItslearningPersonAdapter } from '../adapter/domain/itslearning-person.adapter.js';
import { IMSESInstitutionRoleType } from '../adapter/domain/role.enum.js';
import { ItsLearningPersonsEventHandler } from './itslearning-persons.event-handler.js';
import { ItsLearningSyncEventHandler } from './itslearning-sync.event-handler.js';
import { PersonExternalSystemsSyncEvent } from '../../../shared/events/person-external-systems-sync.event.js';
import { EmailMicroserviceAddressChangedEvent } from '../../../shared/events/email-microservice/email-microservice-address-changed.event.js';
import { Err, Ok } from '../../../shared/util/result.js';

function makeKontextEventData(props?: Partial<PersonenkontextUpdatedData>): PersonenkontextUpdatedData {
    return {
        id: props?.id ?? faker.string.uuid(),
        orgaId: props?.orgaId ?? faker.string.uuid(),
        parentOrgaId: props?.parentOrgaId ?? faker.string.uuid(),
        rolle: props?.rolle ?? faker.helpers.enumValue(RollenArt),
        rolleId: props?.rolleId ?? faker.string.uuid(),
        orgaTyp: props?.orgaTyp ?? OrganisationsTyp.SCHULE,
        serviceProviderExternalSystems: props?.serviceProviderExternalSystems ?? [ServiceProviderSystem.ITSLEARNING],
        isItslearningOrga: props?.isItslearningOrga ?? true,
    };
}

describe('ItsLearning Persons Event Handler', () => {
    let module: TestingModule;

    let sut: ItsLearningPersonsEventHandler;
    let itslearningPersonAdapterMock: DeepMocked<ItslearningPersonAdapter>;
    let itslearningMembershipAdapterMock: DeepMocked<ItslearningMembershipAdapter>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let syncEventHandlerMock: DeepMocked<ItsLearningSyncEventHandler>;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule, DatabaseTestModule.forRoot()],
            providers: [
                ItsLearningPersonsEventHandler,
                {
                    provide: ItslearningPersonAdapter,
                    useValue: createMock(ItslearningPersonAdapter),
                },
                {
                    provide: ItslearningMembershipAdapter,
                    useValue: createMock(ItslearningMembershipAdapter),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: ItsLearningSyncEventHandler,
                    useValue: createMock(ItsLearningSyncEventHandler),
                },
            ],
        }).compile();

        sut = module.get(ItsLearningPersonsEventHandler);
        itslearningPersonAdapterMock = module.get(ItslearningPersonAdapter);
        itslearningMembershipAdapterMock = module.get(ItslearningMembershipAdapter);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        syncEventHandlerMock = module.get(ItsLearningSyncEventHandler);
        loggerMock = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        sut.ENABLED = true;
        personenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValue([]);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('updateMemberships', () => {
        it('should call repo with current kontexte', async () => {
            const personId: string = faker.string.uuid();
            const currentKontexte: PersonenkontextUpdatedData[] = [makeKontextEventData()];
            itslearningMembershipAdapterMock.setMemberships.mockResolvedValueOnce({
                ok: true,
                value: { deleted: 0, updated: 1 },
            } satisfies Result<SetMembershipsResult, DomainError>);
            const eventID: string = faker.string.uuid();

            await sut.updateMemberships(personId, currentKontexte, eventID);

            expect(itslearningMembershipAdapterMock.setMemberships).toHaveBeenCalledTimes(1);
            expect(loggerMock.info).toHaveBeenCalledWith(
                `[EventID: ${eventID}] Set ${currentKontexte.length} memberships for person ${personId}`,
            );
        });

        it('should log errors', async () => {
            const error: DomainError = new ItsLearningError('Test Error');
            const personId: string = faker.string.uuid();
            const currentKontexte: PersonenkontextUpdatedData[] = [makeKontextEventData()];
            itslearningMembershipAdapterMock.setMemberships.mockResolvedValueOnce({ ok: false, error } satisfies Result<
                SetMembershipsResult,
                DomainError
            >);
            const eventID: string = faker.string.uuid();

            await sut.updateMemberships(personId, currentKontexte, eventID);

            expect(itslearningMembershipAdapterMock.setMemberships).toHaveBeenCalledTimes(1);
            expect(loggerMock.error).toHaveBeenCalledWith(
                `[EventID: ${eventID}] Could not set ${currentKontexte.length} memberships for person ${personId}`,
                error,
            );
        });
    });

    describe('deletePerson', () => {
        it('should delete person in itsLearning', async () => {
            const personID: string = faker.string.uuid();
            itslearningPersonAdapterMock.deletePerson.mockResolvedValueOnce(undefined);
            const eventID: string = faker.string.uuid();

            await sut.deletePerson(personID, eventID);

            expect(itslearningPersonAdapterMock.deletePerson).toHaveBeenCalledWith(personID, eventID);
            expect(loggerMock.info).toHaveBeenCalledWith(`[EventID: ${eventID}] Person with ID ${personID} deleted.`);
        });

        it('should log error if person could not be deleted', async () => {
            const personID: string = faker.string.uuid();
            itslearningPersonAdapterMock.deletePerson.mockResolvedValueOnce(new ItsLearningError('Test Error'));
            const eventID: string = faker.string.uuid();

            await sut.deletePerson(personID, eventID);

            expect(itslearningPersonAdapterMock.deletePerson).toHaveBeenCalledWith(personID, eventID);
            expect(loggerMock.error).toHaveBeenCalledWith(
                `[EventID: ${eventID}] Could not delete person with ID ${personID} from itsLearning.`,
            );
        });
    });

    describe('personRenamedEventHandler', () => {
        const oldFirstname: string = faker.person.firstName();
        const oldLastname: string = faker.person.lastName();

        function createPersonAndResponse(params: Partial<Person<true>> = {}): [Person<true>, PersonResponse] {
            if (!('username' in params)) {
                params.username = faker.internet.username();
            }

            const person: Person<true> = DoFactory.createPerson(true, params);

            const readPersonResponse: PersonResponse = {
                username: person.id,
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                primaryRoleType: true,
                institutionRole: faker.helpers.enumValue(IMSESInstitutionRoleType),
            };

            return [person, readPersonResponse];
        }

        it('should send person to itsLearning', async () => {
            const [person, personResponse]: [Person<true>, PersonResponse] = createPersonAndResponse();
            itslearningPersonAdapterMock.readPerson.mockResolvedValueOnce(personResponse); // Read person
            itslearningPersonAdapterMock.createOrUpdatePerson.mockResolvedValueOnce(Ok(undefined)); // Create person
            const event: PersonRenamedEvent = PersonRenamedEvent.fromPerson(
                person,
                faker.internet.username(),
                oldFirstname,
                oldLastname,
            );

            await sut.personRenamedEventHandler(event);

            expect(itslearningPersonAdapterMock.createOrUpdatePerson).toHaveBeenCalledWith(
                {
                    id: person.id,
                    firstName: person.vorname,
                    lastName: person.familienname,
                    username: person.username,
                    institutionRoleType: personResponse.institutionRole,
                },
                `${event.eventID}-PERSON-RENAMED-UPDATE`,
            );
            expect(loggerMock.info).toHaveBeenCalledWith(
                `[EventID: ${event.eventID}] Person with ID ${person.id} updated in itsLearning!`,
            );
        });

        it('should log error if person could not be updated', async () => {
            const [person, personResponse]: [Person<true>, PersonResponse] = createPersonAndResponse();
            const error: DomainError = new ItsLearningError('Test Error');
            itslearningPersonAdapterMock.readPerson.mockResolvedValueOnce(personResponse); // Read person
            itslearningPersonAdapterMock.createOrUpdatePerson.mockResolvedValueOnce(Err(error)); // Create person
            const event: PersonRenamedEvent = PersonRenamedEvent.fromPerson(
                person,
                faker.internet.username(),
                oldFirstname,
                oldLastname,
            );

            await sut.personRenamedEventHandler(event);

            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `[EventID: ${event.eventID}] Person with ID ${person.id} could not be updated in itsLearning!`,
                error,
            );
        });

        describe('when person is invalid', () => {
            it('should log error, if person has no username', async () => {
                const [person]: [Person<true>, PersonResponse] = createPersonAndResponse({ username: undefined });
                const event: PersonRenamedEvent = PersonRenamedEvent.fromPerson(
                    person,
                    faker.internet.username(),
                    oldFirstname,
                    oldLastname,
                );

                await sut.personRenamedEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Person with ID ${person.id} has no username!`,
                );
            });
        });

        describe("when person doesn't exist in itslearning", () => {
            it('should log info', async () => {
                const [person]: [Person<true>, PersonResponse] = createPersonAndResponse();
                itslearningPersonAdapterMock.readPerson.mockResolvedValueOnce(undefined); // Read person
                const event: PersonRenamedEvent = PersonRenamedEvent.fromPerson(
                    person,
                    faker.internet.username(),
                    oldFirstname,
                    oldLastname,
                );

                await sut.personRenamedEventHandler(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Person with ID ${person.id} is not in itslearning, ignoring.`,
                );
            });
        });

        it('should skip event, if not enabled', async () => {
            sut.ENABLED = false;
            const [person]: [Person<true>, PersonResponse] = createPersonAndResponse();
            const event: PersonRenamedEvent = PersonRenamedEvent.fromPerson(
                person,
                faker.internet.username(),
                oldFirstname,
                oldLastname,
            );

            await sut.personRenamedEventHandler(event);

            expect(loggerMock.info).toHaveBeenCalledWith(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
        });
    });

    describe('updatePerson', () => {
        const person: PersonenkontextUpdatedPersonData = {
            id: faker.string.uuid(),
            vorname: faker.person.firstName(),
            familienname: faker.person.lastName(),
            username: faker.internet.username(),
        };

        it('should send person to itsLearning', async () => {
            const kontextData: PersonenkontextUpdatedData = makeKontextEventData({ rolle: RollenArt.LERN });
            itslearningPersonAdapterMock.createOrUpdatePerson.mockResolvedValueOnce(Ok(undefined));
            const eventID: string = faker.string.uuid();

            await sut.updatePerson(person, [kontextData], eventID);

            expect(itslearningPersonAdapterMock.createOrUpdatePerson).toHaveBeenCalledWith(
                {
                    id: person.id,
                    firstName: person.vorname,
                    lastName: person.familienname,
                    username: person.username,
                    institutionRoleType: IMSESInstitutionRoleType.STUDENT,
                },
                eventID,
            );
            expect(loggerMock.info).toHaveBeenCalledWith(
                `[EventID: ${eventID}] Person with ID ${person.id} created in itsLearning!`,
            );
        });

        it('should log error if person could not be created', async () => {
            const kontextData: PersonenkontextUpdatedData = makeKontextEventData({ rolle: RollenArt.LERN });
            itslearningPersonAdapterMock.createOrUpdatePerson.mockResolvedValueOnce(
                Err(new ItsLearningError('Test Error')),
            );
            const eventID: string = faker.string.uuid();

            await sut.updatePerson(person, [kontextData], eventID);

            expect(loggerMock.error).toHaveBeenCalledWith(
                `[EventID: ${eventID}] Person with ID ${person.id} could not be sent to itsLearning! Error: Test Error`,
            );
        });

        describe('when person is invalid', () => {
            it('should log error, if person has no username', async () => {
                const { username, ...personWithoutUsername }: PersonenkontextUpdatedPersonData = person;
                const eventID: string = faker.string.uuid();

                await sut.updatePerson(personWithoutUsername, [], eventID);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `[EventID: ${eventID}] Person with ID ${person.id} has no username!`,
                );
            });
        });
    });

    describe('oxUserChangedEventHandler', () => {
        const personId: string = faker.string.uuid();
        const email: string = faker.internet.email();
        const generatedEvent: OxUserChangedEvent = new OxUserChangedEvent(
            personId,
            faker.internet.username(),
            faker.string.uuid(),
            faker.internet.username(),
            faker.string.uuid(),
            faker.string.uuid(),
            email,
        );

        it('should update email', async () => {
            itslearningPersonAdapterMock.updateEmail.mockResolvedValueOnce(Ok(undefined)); // Update email

            await sut.oxUserChangedEventHandler(generatedEvent);

            expect(itslearningPersonAdapterMock.updateEmail).toHaveBeenCalledWith(
                personId,
                email,
                `${generatedEvent.eventID}-EMAIL-UPDATE`,
            );
            expect(loggerMock.info).toHaveBeenCalledWith(
                `[EventID: ${generatedEvent.eventID}] Updated E-Mail for person with ID ${personId}!`,
            );
        });

        it('should log error, if email could not be updated', async () => {
            const error: DomainError = new ItsLearningError('Test Error');
            itslearningPersonAdapterMock.updateEmail.mockResolvedValueOnce(Err(error)); // Update email

            await sut.oxUserChangedEventHandler(generatedEvent);

            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `[EventID: ${generatedEvent.eventID}] Could not update E-Mail for person with ID ${personId}!`,
                error,
            );
        });

        it('should skip event, if not enabled', async () => {
            sut.ENABLED = false;
            itslearningPersonAdapterMock.updateEmail.mockResolvedValueOnce(Ok(undefined)); // Update email

            await sut.oxUserChangedEventHandler(generatedEvent);

            expect(loggerMock.info).toHaveBeenCalledWith(
                `[EventID: ${generatedEvent.eventID}] Not enabled, ignoring email update.`,
            );
        });
    });

    describe('microserviceEmailChangedEventHandler', () => {
        const personId: string = faker.string.uuid();
        const newPrimaryEmail: string = faker.internet.email();
        const generatedEvent: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
            personId,
            newPrimaryEmail,
            faker.internet.email(),
            faker.internet.email(),
            faker.internet.email(),
        );

        it('should update email', async () => {
            itslearningPersonAdapterMock.updateEmail.mockResolvedValueOnce(Ok(undefined)); // Update email

            await sut.microserviceEmailChangedEventHandler(generatedEvent);

            expect(itslearningPersonAdapterMock.updateEmail).toHaveBeenCalledWith(
                personId,
                newPrimaryEmail,
                `${generatedEvent.eventID}-EMAIL-UPDATE`,
            );
            expect(loggerMock.info).toHaveBeenCalledWith(
                `[EventID: ${generatedEvent.eventID}] Updated E-Mail for person with ID ${personId}!`,
            );
        });

        it('should log error, if email could not be updated', async () => {
            const error: DomainError = new ItsLearningError('Test Error');
            itslearningPersonAdapterMock.updateEmail.mockResolvedValueOnce(Err(error)); // Update email

            await sut.microserviceEmailChangedEventHandler(generatedEvent);

            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `[EventID: ${generatedEvent.eventID}] Could not update E-Mail for person with ID ${personId}!`,
                error,
            );
        });

        it('should skip event, if not enabled', async () => {
            sut.ENABLED = false;
            itslearningPersonAdapterMock.updateEmail.mockResolvedValueOnce(Ok(undefined)); // Update email

            await sut.microserviceEmailChangedEventHandler(generatedEvent);

            expect(loggerMock.info).toHaveBeenCalledWith(
                `[EventID: ${generatedEvent.eventID}] Not enabled, ignoring email update from microservice.`,
            );
        });
    });

    describe('updatePersonenkontexteEventHandler', () => {
        it('should not throw', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                { id: faker.string.uuid(), vorname: faker.person.firstName(), familienname: faker.person.lastName() },
                [],
                [],
                [],
            );

            vi.spyOn(sut, 'updatePerson').mockResolvedValueOnce(undefined);
            vi.spyOn(sut, 'updateMemberships').mockResolvedValueOnce(undefined);
            vi.spyOn(sut, 'deletePerson').mockResolvedValueOnce(undefined);

            await sut.updatePersonenkontexteEventHandler(event);
        });

        it('should call updatePerson, if at least one relevant kontext exists', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                { id: faker.string.uuid(), vorname: faker.person.firstName(), familienname: faker.person.lastName() },
                [],
                [],
                [makeKontextEventData({ serviceProviderExternalSystems: [ServiceProviderSystem.ITSLEARNING] })],
            );

            const updatePersonSpy: Mock = vi.spyOn(sut, 'updatePerson').mockResolvedValueOnce(undefined);
            vi.spyOn(sut, 'updateMemberships').mockResolvedValueOnce(undefined);
            vi.spyOn(sut, 'deletePerson').mockResolvedValueOnce(undefined);

            await sut.updatePersonenkontexteEventHandler(event);

            expect(updatePersonSpy).toHaveBeenCalledTimes(1);
        });

        it('should call updateMemberships with correct number of kontexte', async () => {
            const schoolKontext: PersonenkontextUpdatedData = makeKontextEventData({
                serviceProviderExternalSystems: [ServiceProviderSystem.ITSLEARNING],
            });
            const klasseKontext: PersonenkontextUpdatedData = makeKontextEventData({
                parentOrgaId: schoolKontext.orgaId,
                isItslearningOrga: false,
                serviceProviderExternalSystems: [ServiceProviderSystem.ITSLEARNING],
                orgaTyp: OrganisationsTyp.KLASSE,
            });

            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                { id: faker.string.uuid(), vorname: faker.person.firstName(), familienname: faker.person.lastName() },
                [],
                [],
                [schoolKontext, klasseKontext],
            );

            vi.spyOn(sut, 'updatePerson').mockResolvedValueOnce(undefined);
            const updateMembershipsSpy: Mock = vi.spyOn(sut, 'updateMemberships').mockResolvedValueOnce(undefined);
            vi.spyOn(sut, 'deletePerson').mockResolvedValueOnce(undefined);

            await sut.updatePersonenkontexteEventHandler(event);

            expect(updateMembershipsSpy).toHaveBeenCalledTimes(1);
            expect(updateMembershipsSpy).toHaveBeenCalledWith(
                event.person.id,
                expect.objectContaining({ length: 2 }),
                `${event.eventID}-UPDATE-MEMBERSHIPS`,
            );
        });

        it('should not call updatePerson, if no relevant kontext exists', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                { id: faker.string.uuid(), vorname: faker.person.firstName(), familienname: faker.person.lastName() },
                [],
                [],
                [
                    makeKontextEventData({
                        serviceProviderExternalSystems: [ServiceProviderSystem.NONE],
                        isItslearningOrga: false,
                    }),
                    makeKontextEventData({
                        orgaTyp: OrganisationsTyp.LAND,
                        serviceProviderExternalSystems: [ServiceProviderSystem.ITSLEARNING],
                        isItslearningOrga: true,
                    }),
                    makeKontextEventData({
                        orgaTyp: OrganisationsTyp.KLASSE,
                        parentOrgaId: undefined,
                        serviceProviderExternalSystems: [ServiceProviderSystem.ITSLEARNING],
                    }),
                ],
            );

            const updatePersonSpy: Mock = vi.spyOn(sut, 'updatePerson').mockResolvedValueOnce(undefined);
            vi.spyOn(sut, 'updateMemberships').mockResolvedValueOnce(undefined);
            vi.spyOn(sut, 'deletePerson').mockResolvedValueOnce(undefined);

            await sut.updatePersonenkontexteEventHandler(event);

            expect(updatePersonSpy).toHaveBeenCalledTimes(0);
        });

        it('should delete person, if no relevant kontext and no itslearning Rollenerweiterung exists', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                { id: faker.string.uuid(), vorname: faker.person.firstName(), familienname: faker.person.lastName() },
                [],
                [],
                [],
            );

            const deletePersonSpy: Mock = vi.spyOn(sut, 'deletePerson').mockResolvedValueOnce(undefined);

            await sut.updatePersonenkontexteEventHandler(event);

            expect(deletePersonSpy).toHaveBeenCalledWith(event.person.id, `${event.eventID}-DELETE-PERSON`);
        });

        it('should delegate to sync handler, if itslearning is given through a Rollenerweiterung', async () => {
            const lehrKontext: PersonenkontextUpdatedData = makeKontextEventData({ rolle: RollenArt.LEHR });
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                { id: faker.string.uuid(), vorname: faker.person.firstName(), familienname: faker.person.lastName() },
                [],
                [],
                [lehrKontext],
            );

            const erweiterterSP: ErweiterterServiceProviderForPK = {
                personenkontext: DoFactory.createPersonenkontext(true, { personId: event.person.id }),
                serviceProvider: DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                }),
            };
            personenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([erweiterterSP]);

            const updatePersonSpy: Mock = vi.spyOn(sut, 'updatePerson').mockResolvedValueOnce(undefined);
            const updateMembershipsSpy: Mock = vi.spyOn(sut, 'updateMemberships').mockResolvedValueOnce(undefined);
            const deletePersonSpy: Mock = vi.spyOn(sut, 'deletePerson').mockResolvedValueOnce(undefined);

            await sut.updatePersonenkontexteEventHandler(event);

            expect(syncEventHandlerMock.personExternalSystemSyncEventHandler).toHaveBeenCalledWith(
                expect.any(PersonExternalSystemsSyncEvent),
            );
            const [syncEvent]: [PersonExternalSystemsSyncEvent] = syncEventHandlerMock
                .personExternalSystemSyncEventHandler.mock.calls[0] as [PersonExternalSystemsSyncEvent];
            expect(syncEvent.personId).toBe(event.person.id);
            expect(updatePersonSpy).not.toHaveBeenCalled();
            expect(updateMembershipsSpy).not.toHaveBeenCalled();
            expect(deletePersonSpy).not.toHaveBeenCalled();
        });

        it('should delegate to sync handler, if own relevant kontext and Rollenerweiterung exist', async () => {
            const leitKontext: PersonenkontextUpdatedData = makeKontextEventData({ rolle: RollenArt.LEIT });
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                { id: faker.string.uuid(), vorname: faker.person.firstName(), familienname: faker.person.lastName() },
                [],
                [],
                [leitKontext],
            );

            const erweiterterSP: ErweiterterServiceProviderForPK = {
                personenkontext: DoFactory.createPersonenkontext(true, { personId: event.person.id }),
                serviceProvider: DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                }),
            };
            personenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([erweiterterSP]);

            const updatePersonSpy: Mock = vi.spyOn(sut, 'updatePerson').mockResolvedValueOnce(undefined);
            const updateMembershipsSpy: Mock = vi.spyOn(sut, 'updateMemberships').mockResolvedValueOnce(undefined);

            await sut.updatePersonenkontexteEventHandler(event);

            expect(syncEventHandlerMock.personExternalSystemSyncEventHandler).toHaveBeenCalledTimes(1);
            expect(updatePersonSpy).not.toHaveBeenCalled();
            expect(updateMembershipsSpy).not.toHaveBeenCalled();
        });

        it('should not delegate to sync handler, if no Rollenerweiterung exists', async () => {
            const lernKontext: PersonenkontextUpdatedData = makeKontextEventData({ rolle: RollenArt.LERN });
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                { id: faker.string.uuid(), vorname: faker.person.firstName(), familienname: faker.person.lastName() },
                [],
                [],
                [lernKontext],
            );

            const updatePersonSpy: Mock = vi.spyOn(sut, 'updatePerson').mockResolvedValueOnce(undefined);
            vi.spyOn(sut, 'updateMemberships').mockResolvedValueOnce(undefined);

            await sut.updatePersonenkontexteEventHandler(event);

            expect(syncEventHandlerMock.personExternalSystemSyncEventHandler).not.toHaveBeenCalled();
            expect(updatePersonSpy).toHaveBeenCalledTimes(1);
        });

        it('should not query Rollenerweiterungen, if no LEHR, LERN or LEIT kontext exists', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                { id: faker.string.uuid(), vorname: faker.person.firstName(), familienname: faker.person.lastName() },
                [],
                [],
                [makeKontextEventData({ rolle: RollenArt.SYSADMIN })],
            );

            vi.spyOn(sut, 'updatePerson').mockResolvedValueOnce(undefined);
            vi.spyOn(sut, 'updateMemberships').mockResolvedValueOnce(undefined);

            await sut.updatePersonenkontexteEventHandler(event);

            expect(personenkontextRepoMock.findErweiterteSPByPersonId).not.toHaveBeenCalled();
            expect(syncEventHandlerMock.personExternalSystemSyncEventHandler).not.toHaveBeenCalled();
        });

        it('should delete person, if only a Rollenerweiterung exists but no LEHR, LERN or LEIT kontext remains', async () => {
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                { id: faker.string.uuid(), vorname: faker.person.firstName(), familienname: faker.person.lastName() },
                [],
                [],
                [],
            );

            const erweiterterSP: ErweiterterServiceProviderForPK = {
                personenkontext: DoFactory.createPersonenkontext(true, { personId: event.person.id }),
                serviceProvider: DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                }),
            };
            personenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([erweiterterSP]);

            const deletePersonSpy: Mock = vi.spyOn(sut, 'deletePerson').mockResolvedValueOnce(undefined);

            await sut.updatePersonenkontexteEventHandler(event);

            expect(personenkontextRepoMock.findErweiterteSPByPersonId).not.toHaveBeenCalled();
            expect(deletePersonSpy).toHaveBeenCalledWith(event.person.id, `${event.eventID}-DELETE-PERSON`);
        });

        it('should skip event, if not enabled', async () => {
            sut.ENABLED = false;
            const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                { id: faker.string.uuid(), vorname: faker.person.firstName(), familienname: faker.person.lastName() },
                [],
                [],
                [],
            );

            await sut.updatePersonenkontexteEventHandler(event);

            expect(loggerMock.info).toHaveBeenCalledWith(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
        });
    });
});
