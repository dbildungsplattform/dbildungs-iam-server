import { faker } from '@faker-js/faker';
import { Test, TestingModule } from '@nestjs/testing';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';

import { ConfigTestModule, DatabaseTestModule, DoFactory, LoggingTestModule } from '../../../../test/utils/index.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { PersonIdentifier } from '../../../core/logging/person-identifier.js';
import { EntityCouldNotBeCreated } from '../../../shared/error/index.js';
import { OxError } from '../../../shared/error/ox.error.js';
import { DisabledEmailAddressGeneratedEvent } from '../../../shared/events/email/disabled-email-address-generated.event.js';
import { EmailAddressAlreadyExistsEvent } from '../../../shared/events/email/email-address-already-exists.event.js';
import { EmailAddressChangedEvent } from '../../../shared/events/email/email-address-changed.event.js';
import { EmailAddressDisabledEvent } from '../../../shared/events/email/email-address-disabled.event.js';
import { EmailAddressGeneratedAfterLdapSyncFailedEvent } from '../../../shared/events/email/email-address-generated-after-ldap-sync-failed.event.js';
import { EmailAddressGeneratedEvent } from '../../../shared/events/email/email-address-generated.event.js';
import { EmailAddressMarkedForDeletionEvent } from '../../../shared/events/email/email-address-marked-for-deletion.event.js';
import { EmailAddressesPurgedEvent } from '../../../shared/events/email/email-addresses-purged.event.js';
import { OrganisationDeletedEvent } from '../../../shared/events/organisation-deleted.event.js';
import { PersonDeletedAfterDeadlineExceededEvent } from '../../../shared/events/person-deleted-after-deadline-exceeded.event.js';
import { PersonDeletedEvent } from '../../../shared/events/person-deleted.event.js';
import { PersonenkontextEventKontextData } from '../../../shared/events/personenkontext-event.types.js';
import { PersonenkontextUpdatedEvent } from '../../../shared/events/personenkontext-updated.event.js';
import { EmailAddressID, OrganisationKennung, PersonID, PersonUsername } from '../../../shared/types/index.js';
import { OXContextID, OXContextName, OXGroupID, OXUserID } from '../../../shared/types/ox-ids.types.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { EmailAddress, EmailAddressStatus } from '../../email/domain/email-address.js';
import { EmailRepo } from '../../email/persistence/email.repo.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { OxGroupNotFoundError } from '../adapter/domain/error/ox-group-not-found.error.js';
import { OxMemberAlreadyInGroupError } from '../adapter/domain/error/ox-member-already-in-group.error.js';
import { OxNoSuchUserError } from '../adapter/domain/error/ox-no-such-user.error.js';
import { OxAdapter } from '../adapter/domain/ox.adapter.js';
import { ListGroupsAction, ListGroupsResponse } from '../adapter/technical/actions/group/list-groups.action.js';
import { ChangeUserParams } from '../adapter/technical/actions/user/change-user.action.js';
import { CreateUserAction } from '../adapter/technical/actions/user/create-user.action.js';
import { ExistsUserAction } from '../adapter/technical/actions/user/exists-user.action.js';
import { GetDataForUserResponse } from '../adapter/technical/actions/user/get-data-user.action.js';
import { OxSendService } from '../adapter/technical/ox.send-service.js';
import { OxEventHandler } from './ox-event-handler.js';
import { OxSyncEventHandler } from './ox-sync-event-handler.js';

describe('OxEventHandler', () => {
    let module: TestingModule;

    let sut: OxEventHandler;
    let oxServiceMock: DeepMocked<OxSendService>;
    let oxSyncHandlerMock: DeepMocked<OxSyncEventHandler>;
    let loggerMock: DeepMocked<ClassLogger>;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let emailRepoMock: DeepMocked<EmailRepo>;
    let eventServiceMock: DeepMocked<EventRoutingLegacyKafkaService>;
    let emailResolverService: DeepMocked<EmailResolverService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule, DatabaseTestModule.forRoot()],
            providers: [
                OxEventHandler,
                OxAdapter,
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: ServiceProviderRepo,
                    useValue: createMock(ServiceProviderRepo),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: EmailRepo,
                    useValue: createMock(EmailRepo),
                },
                {
                    provide: OxSendService,
                    useValue: createMock(OxSendService),
                },
                {
                    provide: OxSyncEventHandler,
                    useValue: createMock(OxSyncEventHandler),
                },
                {
                    provide: EventRoutingLegacyKafkaService,
                    useValue: createMock(EventRoutingLegacyKafkaService),
                },
                {
                    provide: EmailResolverService,
                    useValue: createMock(EmailResolverService),
                },
            ],
        }).compile();

        sut = module.get(OxEventHandler);
        oxServiceMock = module.get(OxSendService);
        oxSyncHandlerMock = module.get(OxSyncEventHandler);
        loggerMock = module.get(ClassLogger);

        personRepositoryMock = module.get(PersonRepository);
        emailRepoMock = module.get(EmailRepo);
        eventServiceMock = module.get(EventRoutingLegacyKafkaService);
        emailResolverService = module.get(EmailResolverService);
        vi.useFakeTimers();
    });

    function getRequestedEmailAddresses(address?: string): EmailAddress<true>[] {
        const emailAddress: EmailAddress<true> = DoFactory.createEmailAddress(true, address);
        return [emailAddress];
    }

    function mockUserCreationRequest(userId: OXUserID, emailAddress: string): void {
        //mock create-oxUser-request
        oxServiceMock.send.mockResolvedValueOnce({
            ok: true,
            value: {
                id: userId,
                firstname: 'firstname',
                lastname: 'lastname',
                username: 'username',
                primaryEmail: emailAddress,
                mailenabled: true,
            },
        });
    }

    /**
     * Mock group retrieval as successful
     * @param oxUserId
     * @param oxGroupId default is 'groupId'
     */
    function mockGroupRetrievalRequestSuccessful(oxUserId: OXUserID, oxGroupId: OXGroupID = 'groupId'): void {
        oxServiceMock.send.mockResolvedValueOnce({
            ok: true,
            value: {
                groups: [
                    {
                        displayname: 'groupDisplayName',
                        id: oxGroupId,
                        name: 'groupName',
                        memberIds: [oxUserId],
                    },
                ],
            },
        });
    }

    /**
     * mock exists-oxUser-request
     * @param exists default is FALSE
     */
    function mockExistsUserRequest(exists: boolean = false): void {
        oxServiceMock.send.mockResolvedValueOnce({
            ok: true,
            value: {
                exists: exists,
            },
        });
    }

    /**
     * Returns an instance of GetDataForUserResponse.
     * If id, username, primaryMail or aliases are undefined, they will be set with default fake values.
     * Firstname and lastname are always set to fake values and mailenabled to true.
     */
    function getGetDataForUserResponse(
        id?: OXUserID,
        username?: string,
        primaryMail?: string,
        aliases?: string[],
    ): GetDataForUserResponse {
        return {
            id: id ?? faker.string.numeric(),
            username: username ?? faker.internet.username(),
            firstname: faker.person.firstName(),
            lastname: faker.person.lastName(),
            mailenabled: true,
            primaryEmail: primaryMail ?? faker.internet.email(),
            aliases: aliases ?? [],
        };
    }

    /**
     * Returns an instance of PersonenkontextUpdatedEvent. RemovedKontexte contains two PersonenkontextEventKontextData, one with rollenArt LEHR and one with EXTERN.
     * @param personId
     * @param rollenArtLehrPKOrgaKennung
     * @param withRemainingCurrentPK true: add one PersonenkontextEventKontextData with rollenArt LEHR to currentKontexte, false: set empty currentKontexte
     */
    function getPersonenkontextUpdatedEvent(
        personId: PersonID,
        rollenArtLehrPKOrgaKennung: string,
        withRemainingCurrentPK: boolean,
    ): PersonenkontextUpdatedEvent {
        const pkEventDataRollenartLehr: PersonenkontextEventKontextData = {
            id: faker.string.uuid(),
            orgaId: faker.string.uuid(),
            rolle: RollenArt.LEHR,
            rolleId: faker.string.uuid(),
            orgaKennung: rollenArtLehrPKOrgaKennung,
            isItslearningOrga: false,
            serviceProviderExternalSystems: [],
        };
        const currentKontexte: PersonenkontextEventKontextData[] = [];
        if (withRemainingCurrentPK) {
            currentKontexte.push(pkEventDataRollenartLehr);
        }
        const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
            {
                id: personId,
                vorname: faker.person.firstName(),
                familienname: faker.person.lastName(),
                username: faker.internet.username(),
            },
            [],
            [
                //removed PKs
                pkEventDataRollenartLehr,
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
            currentKontexte,
        );
        return event;
    }
    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        sut.ENABLED = true;
        vi.resetAllMocks();
        emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(false);
    });

    describe('Ignore events when new Microservice enabled', () => {
        it('should log ignoring PersonenkontextUpdatedEvent event', async () => {
            vi.resetAllMocks();
            emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(true);

            const personId: PersonID = faker.string.uuid();
            const rollenArtLehrPKOrgaKennung: OrganisationKennung = faker.string.numeric(7);
            const event: PersonenkontextUpdatedEvent = getPersonenkontextUpdatedEvent(
                personId,
                rollenArtLehrPKOrgaKennung,
                true,
            );

            await sut.handlePersonenkontextUpdatedEvent(event);
            expect(loggerMock.info).toHaveBeenCalledWith(
                `Ignoring Event for personId:${personId} because email microservice is enabled`,
            );
        });

        it('should log ignoring PersonDeletedEvent event', async () => {
            vi.resetAllMocks();
            emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(true);

            const personId: PersonID = faker.string.uuid();
            const event: PersonDeletedEvent = new PersonDeletedEvent(personId, faker.internet.username());

            await sut.handlePersonDeletedEvent(event);
            expect(loggerMock.info).toHaveBeenCalledWith(
                `Ignoring Event for personId:${personId} because email microservice is enabled`,
            );
        });
    });

    describe('createOxGroup', () => {
        let personId: PersonID;
        let fakeDstNr: string;
        let event: EmailAddressGeneratedEvent;
        let person: Person<true>;

        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            fakeDstNr = faker.string.numeric();
            event = new EmailAddressGeneratedEvent(
                personId,
                faker.internet.username(),
                faker.string.uuid(),
                faker.internet.email(),
                true,
                fakeDstNr,
            );
            person = DoFactory.createPerson(true, {
                email: faker.internet.email(),
            });
        });

        describe('when creating group fails', () => {
            it('should log error about failing oxGroup-creation', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([createMock(EmailAddress<true>)]);

                //mock exists-oxUser-request
                mockExistsUserRequest(false);
                //mock create-oxUser-request
                const fakeOXUserId: string = faker.string.uuid();
                mockUserCreationRequest(fakeOXUserId, event.address);
                //mock list-oxGroups-request: empty result -> no groups found
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        groups: [],
                    },
                });
                //mock create-oxGroup-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: new OxError(),
                });

                await sut.handleEmailAddressGeneratedEvent(event);

                expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(CreateUserAction));
                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Could Not Create OxGroup with name:lehrer-${fakeDstNr}, displayName:lehrer-${fakeDstNr}`,
                );
                expect(eventServiceMock.publish).toHaveBeenCalledTimes(0);
            });
        });
    });

    describe('getOxGroupByName', () => {
        let personId: PersonID;
        let fakeDstNr: string;
        let event: EmailAddressGeneratedEvent;
        let person: Person<true>;

        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            fakeDstNr = faker.string.numeric();
            event = new EmailAddressGeneratedEvent(
                personId,
                faker.internet.username(),
                faker.string.uuid(),
                faker.internet.email(),
                true,
                fakeDstNr,
            );
            person = DoFactory.createPerson(true, { email: faker.internet.email() });
        });

        describe('when existing group is found', () => {
            it('should return the existing groups id', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([
                    DoFactory.createEmailAddress(true),
                ]);

                //mock exists-oxUser-request
                mockExistsUserRequest(false);
                //mock create-oxUser-request
                const fakeOXUserId: string = faker.string.uuid();
                mockUserCreationRequest(fakeOXUserId, event.address);
                //mock list-oxGroups-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        groups: [
                            {
                                displayname: `lehrer-${fakeDstNr}`,
                                id: 'id',
                                name: `lehrer-${fakeDstNr}`,
                                memberIds: [],
                            },
                        ],
                    },
                });

                //mock add-member-to-oxGroup-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        status: {
                            code: 'success',
                        },
                        data: undefined,
                    },
                });
                //mock changeByModuleAccess request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });

                await sut.handleEmailAddressGeneratedEvent(event);

                expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(CreateUserAction));
                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Found existing oxGroup for oxGroupName:lehrer-${fakeDstNr}`,
                );
                expect(eventServiceMock.publish).toHaveBeenCalledTimes(1);
            });
        });

        describe('when OX-request fails', () => {
            it('should log error', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([createMock(EmailAddress<true>)]);

                //mock exists-oxUser-request
                mockExistsUserRequest(false);
                //mock create-oxUser-request
                const fakeOXUserId: string = faker.string.uuid();
                mockUserCreationRequest(fakeOXUserId, event.address);
                //mock list-oxGroups-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: new OxError('mockError'),
                });

                await sut.handleEmailAddressGeneratedEvent(event);

                expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(CreateUserAction));
                expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(ListGroupsAction));

                expect(loggerMock.error).toHaveBeenCalledWith(`Could Not Retrieve Groups For Context, contextId:10`);
                expect(eventServiceMock.publish).toHaveBeenCalledTimes(0);
            });
        });

        describe('when no matching groups is found', () => {
            it('should log error', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([createMock(EmailAddress<true>)]);

                //mock exists-oxUser-request
                mockExistsUserRequest(false);
                //mock create-oxUser-request
                const fakeOXUserId: string = faker.string.uuid();
                mockUserCreationRequest(fakeOXUserId, event.address);
                //mock list-oxGroups-request, mock no matching group found
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        groups: [],
                    },
                });
                const fakeOxGroupId: OXGroupID = faker.string.uuid();
                //mock create-oxGroup-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        id: fakeOxGroupId,
                    },
                });
                //mock add-member-to-oxGroup-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        status: {
                            code: 'success',
                        },
                        data: undefined,
                    },
                });
                //mock changeByModuleAccess request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });

                await sut.handleEmailAddressGeneratedEvent(event);

                expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(CreateUserAction));
                expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(ListGroupsAction));

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Found No Matching OxGroup For OxGroupName:lehrer-${fakeDstNr}`,
                );
                expect(eventServiceMock.publish).toHaveBeenCalledTimes(1);
            });
        });

        describe('when multiple groups are found for same groupName', () => {
            it('should log error', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([createMock(EmailAddress<true>)]);

                //mock exists-oxUser-request
                mockExistsUserRequest(false);
                //mock create-oxUser-request
                const fakeOXUserId: string = faker.string.uuid();
                mockUserCreationRequest(fakeOXUserId, event.address);
                //mock list-oxGroups-request, mock no matching group found
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        groups: [
                            {
                                displayname: `lehrer-${fakeDstNr}`,
                                id: 'id',
                                name: `lehrer-${fakeDstNr}`,
                                memberIds: [],
                            },
                            {
                                displayname: `lehrer-${fakeDstNr}`,
                                id: 'id',
                                name: `lehrer-${fakeDstNr}-`,
                                memberIds: [],
                            },
                        ],
                    },
                });

                await sut.handleEmailAddressGeneratedEvent(event);

                expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(CreateUserAction));
                expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(ListGroupsAction));

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Found multiple OX-groups For OxGroupName:lehrer-${fakeDstNr}, Cannot Proceed`,
                );
                expect(eventServiceMock.publish).toHaveBeenCalledTimes(0);
            });
        });
    });

    describe('addOxUserToOxGroup', () => {
        let personId: PersonID;
        let username: PersonUsername;
        let personIdentifier: PersonIdentifier;
        let fakeDstNr: string;
        let event: EmailAddressGeneratedEvent;
        let person: Person<true>;

        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            username = faker.internet.username();
            personIdentifier = {
                personId: personId,
                username: username,
            };
            fakeDstNr = faker.string.numeric();
            event = new EmailAddressGeneratedEvent(
                personId,
                username,
                faker.string.uuid(),
                faker.internet.email(),
                true,
                fakeDstNr,
            );
            person = DoFactory.createPerson(true, { email: faker.internet.email() });
        });

        describe('when adding user as member to group fails because member is already in group', () => {
            it('should log info about that intentional error', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([
                    DoFactory.createEmailAddress(true),
                ]);

                //mock exists-oxUser-request
                mockExistsUserRequest(false);
                //mock create-oxUser-request
                const fakeOXUserId: string = faker.string.uuid();
                mockUserCreationRequest(fakeOXUserId, event.address);
                //mock list-oxGroups-request, empty result -> no groups found
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        groups: [],
                    },
                });
                const fakeOxGroupId: OXGroupID = faker.string.uuid();
                //mock create-oxGroup-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        id: fakeOxGroupId,
                    },
                });
                //mock add-member-to-oxGroup-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: new OxMemberAlreadyInGroupError('msg'),
                });

                await sut.handleEmailAddressGeneratedEvent(event);

                expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(CreateUserAction));
                expect(loggerMock.infoPersonalized).toHaveBeenCalledWith(
                    `Added OxUser To OxGroup not necessary (already in group), oxUserId:${fakeOXUserId}, oxGroupId:${fakeOxGroupId}`,
                    personIdentifier,
                );
                expect(eventServiceMock.publish).toHaveBeenCalledTimes(0);
            });
        });

        describe('when adding user as member to group fails', () => {
            it('should log error about failing addition to group', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([createMock(EmailAddress<true>)]);

                //mock exists-oxUser-request
                mockExistsUserRequest(false);
                //mock create-oxUser-request
                const fakeOXUserId: string = faker.string.uuid();
                mockUserCreationRequest(fakeOXUserId, event.address);
                //mock list-oxGroups-request, empty result -> no groups found
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        groups: [],
                    },
                });
                const fakeOxGroupId: OXGroupID = faker.string.uuid();
                //mock create-oxGroup-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        id: fakeOxGroupId,
                    },
                });
                //mock add-member-to-oxGroup-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: new OxError(),
                });

                await sut.handleEmailAddressGeneratedEvent(event);

                expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(CreateUserAction));
                expect(loggerMock.errorPersonalized).toHaveBeenCalledWith(
                    `Could Not Add OxUser To OxGroup, oxUserId:${fakeOXUserId}, oxGroupId:${fakeOxGroupId}`,
                    personIdentifier,
                );
                expect(eventServiceMock.publish).toHaveBeenCalledTimes(0);
            });
        });
    });

    describe('handleEmailAddressGeneratedEvent', () => {
        let personId: PersonID;
        let username: PersonUsername;
        let personIdentifier: PersonIdentifier;
        let event: EmailAddressGeneratedEvent;
        let person: Person<true>;

        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            username = faker.internet.username();
            personIdentifier = {
                personId: personId,
                username: username,
            };
            event = new EmailAddressGeneratedEvent(
                personId,
                username,
                faker.string.uuid(),
                faker.internet.email(),
                true,
                faker.string.numeric(),
            );
            person = DoFactory.createPerson(true, { email: faker.internet.email(), username: username });
        });

        it('should skip event, if not enabled', async () => {
            sut.ENABLED = false;
            await sut.handleEmailAddressGeneratedEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith('Not enabled, ignoring event');
            expect(oxServiceMock.send).not.toHaveBeenCalled();
        });

        it('should log error when person already exists in OX', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([createMock(EmailAddress<true>)]);
            //mock exists-oxUser-request
            mockExistsUserRequest(true);

            await sut.handleEmailAddressGeneratedEvent(event);

            expect(oxServiceMock.send).toHaveBeenLastCalledWith(expect.any(ExistsUserAction));
            expect(oxServiceMock.send).toHaveBeenCalledTimes(1);
            expect(loggerMock.errorPersonalized).toHaveBeenLastCalledWith(
                `Cannot create user in OX, user already exists`,
                personIdentifier,
            );
        });

        it('should set email to failed when person already exists in OX', async () => {
            const mockEmail: EmailAddress<true> = DoFactory.createEmailAddress(true);
            vi.spyOn(mockEmail, 'failed');
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([mockEmail]);
            //mock exists-oxUser-request
            mockExistsUserRequest(true);

            await sut.handleEmailAddressGeneratedEvent(event);

            expect(mockEmail.failed).toHaveBeenCalled();
            expect(emailRepoMock.save).toHaveBeenCalledWith(mockEmail);
        });

        it('should log error when person cannot be found in DB', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(undefined);

            await sut.handleEmailAddressGeneratedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledTimes(0);
            expect(loggerMock.errorPersonalized).toHaveBeenLastCalledWith(`Person not found`, personIdentifier);
        });

        it('should log error when person has no username set', async () => {
            person.username = undefined;
            personRepositoryMock.findById.mockResolvedValueOnce(person);

            await sut.handleEmailAddressGeneratedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledTimes(0);
            expect(loggerMock.errorPersonalized).toHaveBeenLastCalledWith(
                `Person has no username: cannot create OXEmailAddress`,
                personIdentifier,
            );
        });

        it('should log error when EmailAddress for person cannot be found', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]);

            await sut.handleEmailAddressGeneratedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledTimes(0);
            expect(loggerMock.error).toHaveBeenLastCalledWith(
                `No REQUESTED email-address found for personId:${personId}`,
            );
        });

        it('should log info and publish OxUserCreatedEvent on success', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([createMock(EmailAddress<true>)]);

            //mock exists-oxUser-request
            mockExistsUserRequest(false);
            //mock create-oxUser-request
            const fakeOXUserId: string = faker.string.uuid();
            mockUserCreationRequest(fakeOXUserId, event.address);
            //mock list-oxGroups-request, no result -> mocks no group found
            const fakeOXGroupId: string = faker.string.uuid();
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    groups: [],
                },
            });
            //mock create-oxGroup-request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    id: fakeOXGroupId,
                },
            });
            //mock add-member-to-oxGroup-request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    status: {
                        code: 'success',
                    },
                    data: undefined,
                },
            });
            //mock changeByModuleAccess request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            });

            await sut.handleEmailAddressGeneratedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(CreateUserAction));
            expect(loggerMock.infoPersonalized).toHaveBeenCalledWith(
                `User created in OX, oxUserId:${fakeOXUserId}, oxEmail:${event.address}`,
                personIdentifier,
            );
            expect(loggerMock.infoPersonalized).toHaveBeenLastCalledWith(
                `Successfully Added OxUser To OxGroup, oxUserId:${fakeOXUserId}, oxGroupId:${fakeOXGroupId}`,
                personIdentifier,
            );
            expect(eventServiceMock.publish).toHaveBeenCalledTimes(1);
        });

        it('should log error but still publish OxUserCreatedEvent when changeByModuleAccess request fails', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([createMock(EmailAddress<true>)]);

            //mock exists-oxUser-request
            mockExistsUserRequest(false);
            //mock create-oxUser-request
            const fakeOXUserId: string = faker.string.uuid();
            mockUserCreationRequest(fakeOXUserId, event.address);
            //mock list-oxGroups-request, no result -> mocks no group found
            const fakeOXGroupId: string = faker.string.uuid();
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    groups: [],
                },
            });
            //mock create-oxGroup-request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    id: fakeOXGroupId,
                },
            });
            //mock add-member-to-oxGroup-request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    status: {
                        code: 'success',
                    },
                    data: undefined,
                },
            });
            //mock changeByModuleAccess request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: false,
                error: new OxError(),
            });

            await sut.handleEmailAddressGeneratedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(CreateUserAction));
            expect(loggerMock.errorPersonalized).toHaveBeenLastCalledWith(
                `Could Not Adjust GlobalAddressBookDisabled For oxUserId:${fakeOXUserId}, error:Unknown OX-error`,
                personIdentifier,
            );
            expect(eventServiceMock.publish).toHaveBeenCalledTimes(1);
        });

        it('should log error when persisting oxUserId fails', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([createMock(EmailAddress<true>)]);

            //mock exists-oxUser-request
            mockExistsUserRequest(false);
            //mock create-oxUser-request
            const fakeOXUserId: string = faker.string.uuid();
            mockUserCreationRequest(fakeOXUserId, event.address);
            //mock list-all-oxGroups-request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    groups: [
                        {
                            displayname: 'string',
                            id: 'id',
                            name: 'name',
                            memberIds: [],
                        },
                    ],
                },
            });
            //mock create-oxGroup-request
            const fakeOxGroupId: OXGroupID = faker.string.uuid();
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    id: fakeOxGroupId,
                },
            });
            //mock add-member-to-oxGroup-request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    status: {
                        code: 'success',
                    },
                    data: undefined,
                },
            });

            emailRepoMock.save.mockResolvedValueOnce(new EntityCouldNotBeCreated('EmailAddress'));

            //mock changeByModuleAccess request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            });

            await sut.handleEmailAddressGeneratedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(CreateUserAction));
            expect(loggerMock.infoPersonalized).toHaveBeenLastCalledWith(
                `User created in OX, oxUserId:${fakeOXUserId}, oxEmail:${event.address}`,
                personIdentifier,
            );
            expect(loggerMock.errorPersonalized).toHaveBeenLastCalledWith(
                `Persisting oxUserId on emailAddress failed`,
                personIdentifier,
            );
            expect(eventServiceMock.publish).toHaveBeenCalledTimes(0);
        });

        it('should log error on failure', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([createMock(EmailAddress<true>)]);

            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    exists: false,
                },
            });

            oxServiceMock.send.mockResolvedValueOnce({
                ok: false,
                error: new OxError('Request failed'),
            });
            await sut.handleEmailAddressGeneratedEvent(event);

            expect(oxServiceMock.send).toHaveBeenLastCalledWith(expect.any(CreateUserAction));
            expect(loggerMock.errorPersonalized).toHaveBeenLastCalledWith(
                `Could not create user in OX, error:Request failed`,
                personIdentifier,
            );
        });
    });

    describe('handleEmailAddressGeneratedAfterLdapSyncFailedEvent', () => {
        let personId: PersonID;
        let username: PersonUsername;
        let personIdentifier: PersonIdentifier;
        let event: EmailAddressGeneratedAfterLdapSyncFailedEvent;
        let person: Person<true>;

        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            username = faker.internet.username();
            personIdentifier = {
                personId: personId,
                username: username,
            };
            event = new EmailAddressGeneratedAfterLdapSyncFailedEvent(
                personId,
                username,
                faker.string.uuid(),
                faker.internet.email(),
                true,
                faker.string.numeric(),
            );
            person = DoFactory.createPerson(true, { email: faker.internet.email(), username: username });
        });

        it('should skip event, if not enabled', async () => {
            sut.ENABLED = false;
            await sut.handleEmailAddressGeneratedAfterLdapSyncFailedEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith('Not enabled, ignoring event');
            expect(oxServiceMock.send).not.toHaveBeenCalled();
        });

        it('should log info and publish OxUserCreatedEvent on success', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([createMock(EmailAddress<true>)]);

            //mock exists-oxUser-request
            mockExistsUserRequest(false);
            //mock create-oxUser-request
            const fakeOXUserId: string = faker.string.uuid();
            mockUserCreationRequest(fakeOXUserId, event.address);
            //mock list-oxGroups-request, no result -> mocks no group found
            const fakeOXGroupId: string = faker.string.uuid();
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    groups: [],
                },
            });
            //mock create-oxGroup-request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    id: fakeOXGroupId,
                },
            });
            //mock add-member-to-oxGroup-request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    status: {
                        code: 'success',
                    },
                    data: undefined,
                },
            });
            //mock changeByModuleAccess request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            });

            await sut.handleEmailAddressGeneratedAfterLdapSyncFailedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledWith(expect.any(CreateUserAction));
            expect(loggerMock.infoPersonalized).toHaveBeenCalledWith(
                `User created in OX, oxUserId:${fakeOXUserId}, oxEmail:${event.address}`,
                personIdentifier,
            );
            expect(loggerMock.infoPersonalized).toHaveBeenLastCalledWith(
                `Successfully Added OxUser To OxGroup, oxUserId:${fakeOXUserId}, oxGroupId:${fakeOXGroupId}`,
                personIdentifier,
            );
            expect(eventServiceMock.publish).toHaveBeenCalledTimes(1);
        });
    });

    describe('handleEmailAddressChangedEvent', () => {
        let personId: PersonID;
        let username: PersonUsername;
        let personIdentifier: PersonIdentifier;
        let event: EmailAddressChangedEvent;
        let person: Person<true>;
        let email: string;
        let oxUserId: string;
        let oxUserName: string;
        let contextId: string;
        let contextName: string;

        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            username = faker.internet.username();
            personIdentifier = {
                personId: personId,
                username: username,
            };
            email = faker.internet.email();
            oxUserId = faker.string.numeric();
            oxUserName = faker.internet.username();
            contextId = '10';
            contextName = 'testContext';
            event = new EmailAddressChangedEvent(
                personId,
                username,
                faker.string.uuid(),
                faker.internet.email(),
                faker.string.uuid(),
                faker.internet.email(),
                faker.string.numeric(),
            );
            person = DoFactory.createPerson(true, { email: email, username: username, oxUserId: oxUserId });
        });

        it('should skip event, if not enabled', async () => {
            sut.ENABLED = false;
            await sut.handleEmailAddressChangedEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith('Not enabled, ignoring event');
            expect(oxServiceMock.send).not.toHaveBeenCalled();
        });

        it('should log error when person cannot be found in DB', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(undefined);

            await sut.handleEmailAddressChangedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledTimes(0);
            expect(loggerMock.errorPersonalized).toHaveBeenLastCalledWith(`Person not found`, personIdentifier);
        });

        it('should log error when person has no username set', async () => {
            person.username = undefined;
            personRepositoryMock.findById.mockResolvedValueOnce(person);

            await sut.handleEmailAddressChangedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledTimes(0);
            expect(loggerMock.errorPersonalized).toHaveBeenLastCalledWith(
                `Person has no username: Cannot Change Email-Address In OX`,
                personIdentifier,
            );
        });

        it('should log error when person has no oxUserId set', async () => {
            person.oxUserId = undefined;
            personRepositoryMock.findById.mockResolvedValueOnce(person);

            await sut.handleEmailAddressChangedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledTimes(0);
            expect(loggerMock.errorPersonalized).toHaveBeenLastCalledWith(`Person has no OXUserId`, personIdentifier);
        });

        it('should log error when no requestedEmailAddress is found for person', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]);

            await sut.handleEmailAddressChangedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledTimes(0);
            expect(loggerMock.error).toHaveBeenLastCalledWith(
                `No REQUESTED email-address found for personId:${personId}`,
            );
        });

        it('should log error when getData for user request fails', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce(getRequestedEmailAddresses());

            oxServiceMock.send.mockResolvedValueOnce({
                ok: false,
                error: new OxError('Request failed'),
            });

            await sut.handleEmailAddressChangedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledTimes(1);
            expect(loggerMock.error).toHaveBeenLastCalledWith(
                `Cannot get data for oxUsername:${person.username} from OX, Aborting Email-Address Change, personId:${personId}, username:${username}`,
            );
        });

        it('should log error when changeUser request fails', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce(getRequestedEmailAddresses());

            //mock getData
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    aliases: [faker.internet.email()],
                },
            });

            //mock changeUser
            oxServiceMock.send.mockResolvedValueOnce({
                ok: false,
                error: new OxError('Request failed'),
            });

            await sut.handleEmailAddressChangedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledTimes(2);
            expect(loggerMock.errorPersonalized).toHaveBeenLastCalledWith(
                `Could not change email-address for oxUserId:${person.oxUserId}, error:Request failed`,
                personIdentifier,
            );
        });

        it('should publish OxUserChangedEvent on success', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce(getRequestedEmailAddresses(email));
            const currentAliases: string[] = [faker.internet.email()];
            //mock getData
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    aliases: currentAliases,
                    username: oxUserName,
                    id: oxUserId,
                    primaryEmail: email,
                },
            });

            //mock changeUser as success
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            });

            await sut.handleEmailAddressChangedEvent(event);

            expect(oxServiceMock.send).toHaveBeenCalledTimes(2);
            expect(loggerMock.error).toHaveBeenCalledTimes(0);
            expect(loggerMock.info).toHaveBeenCalledWith(
                `Found mostRecentRequested Email-Address:${JSON.stringify(email)} for personId:${personId}`,
            );
            //use regex, because strict comparison fails, local test-var currentAliases has changed by the implemented function when expect is checked here
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringMatching(/Found Current aliases:.*/));
            expect(loggerMock.info).toHaveBeenCalledWith(
                `Added New alias:${email}, personId:${personId}, username:${username}`,
            );
            expect(loggerMock.infoPersonalized).toHaveBeenLastCalledWith(
                `Changed primary email-address in OX for user, oxUserId:${oxUserId}, oxUsername:${username}, new email-address:${email}`,
                personIdentifier,
            );
            expect(eventServiceMock.publish).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    personId: personId,
                    keycloakUsername: username,
                    oxUserId: oxUserId,
                    oxUserName: username, //this is the new OxUserName, it's changed on renaming in SPSH
                    oxContextId: contextId,
                    oxContextName: contextName,
                    primaryEmail: email,
                }),
                expect.objectContaining({
                    personId: personId,
                    keycloakUsername: username,
                    oxUserId: oxUserId,
                    oxUserName: username, //this is the new OxUserName, it's changed on renaming in SPSH
                    oxContextId: contextId,
                    oxContextName: contextName,
                    primaryEmail: email,
                }),
            );
        });
    });

    /**
     * Testing the called method changeOxUser in general is done via test-cases for handleEmailAddressChangedEvent.
     */
    describe('handleDisabledEmailAddressGeneratedEvent', () => {
        let personId: PersonID;
        let event: DisabledEmailAddressGeneratedEvent;
        let person: Person<true>;
        let username: PersonUsername;
        let personIdentifier: PersonIdentifier;
        let emailId: string;
        let email: string;
        let domain: string;
        let oxUserId: string;
        let oxUserName: string;
        let contextId: string;
        let contextName: string;

        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            username = faker.internet.username();
            personIdentifier = {
                personId: personId,
                username: username,
            };
            emailId = faker.string.uuid();
            email = faker.internet.email();
            domain = faker.internet.domainName();
            oxUserId = faker.string.numeric();
            oxUserName = faker.internet.username();
            contextId = '10';
            contextName = 'testContext';
            event = new DisabledEmailAddressGeneratedEvent(personId, username, email, emailId, domain);
            person = DoFactory.createPerson(true, { email: email, username: username, oxUserId: oxUserId });
        });

        it('should skip event, if not enabled', async () => {
            sut.ENABLED = false;
            await sut.handleDisabledEmailAddressGeneratedEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith('Not enabled, ignoring event');
            expect(oxServiceMock.send).not.toHaveBeenCalled();
        });

        it('should publish DisabledOxUserChangedEvent on success', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce(getRequestedEmailAddresses(email));
            const currentAliases: string[] = [faker.internet.email()];
            //mock getData
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    aliases: currentAliases,
                    username: oxUserName,
                    id: oxUserId,
                    primaryEmail: email,
                },
            });

            //mock changeUser as success
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            });

            await sut.handleDisabledEmailAddressGeneratedEvent(event);

            expect(loggerMock.infoPersonalized).toHaveBeenLastCalledWith(
                `Changed primary email-address in OX for user, oxUserId:${oxUserId}, oxUsername:${username}, new email-address:${email}`,
                personIdentifier,
            );
            expect(eventServiceMock.publish).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    personId: personId,
                    keycloakUsername: username,
                    oxUserId: oxUserId,
                    oxUserName: username, //this is the new OxUserName, it's changed on renaming in SPSH
                    oxContextId: contextId,
                    oxContextName: contextName,
                    primaryEmail: email,
                }),
                expect.objectContaining({
                    personId: personId,
                    keycloakUsername: username,
                    oxUserId: oxUserId,
                    oxUserName: username, //this is the new OxUserName, it's changed on renaming in SPSH
                    oxContextId: contextId,
                    oxContextName: contextName,
                    primaryEmail: email,
                }),
            );
        });
    });

    describe('handleEmailAddressAlreadyExistsEvent', () => {
        let personId: PersonID;
        let event: EmailAddressAlreadyExistsEvent;
        let person: Person<true>;

        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            event = new EmailAddressAlreadyExistsEvent(personId, faker.string.uuid());
            person = DoFactory.createPerson(true, {
                id: personId,
                email: faker.internet.email(),
                username: faker.internet.username(),
                oxUserId: faker.string.uuid(),
            });
        });

        describe('when handler is disabled', () => {
            it('should log and skip processing when not enabled', async () => {
                sut.ENABLED = false;
                await sut.handleEmailAddressAlreadyExistsEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith('Not enabled, ignoring event');
            });
        });

        describe('when person is not found', () => {
            it('should log error if person does not exist', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(undefined);

                await sut.handleEmailAddressAlreadyExistsEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(`Person not found for personId:${event.personId}`);
            });
        });

        describe('when person has no oxUserId', () => {
            it('should log error if oxUserId is missing', async () => {
                person.oxUserId = undefined;
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                await sut.handleEmailAddressAlreadyExistsEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Person with personId:${event.personId} does not have a ox_id. Cannot sync.`,
                );
            });
        });

        describe('when person has no username', () => {
            it('should log error if username is missing', async () => {
                person.username = undefined;
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                await sut.handleEmailAddressAlreadyExistsEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Person with personId:${event.personId} does not have a username. Cannot sync.`,
                );
            });
        });

        describe('successful scenario', () => {
            it('should successfully process event and publish OxUserChangedEvent', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                await sut.handleEmailAddressAlreadyExistsEvent(event);

                expect(loggerMock.info).toHaveBeenLastCalledWith(
                    `Successfully synced user, personId:${event.personId}, oxUserId:${person.oxUserId}`,
                );
                expect(oxSyncHandlerMock.sync).toHaveBeenCalledWith(event.personId, person.username);
            });
        });
    });

    describe('handlePersonDeletedEvent', () => {
        let personId: PersonID;
        let username: PersonUsername;
        let personIdentifier: PersonIdentifier;
        let event: PersonDeletedEvent;

        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            username = faker.internet.username();
            personIdentifier = {
                personId: personId,
                username: username,
            };
            event = new PersonDeletedEvent(personId, username, faker.internet.email());
        });

        describe('when handler is disabled', () => {
            it('should log and skip processing when not enabled', async () => {
                sut.ENABLED = false;
                await sut.handlePersonDeletedEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith('Not enabled, ignoring event');
            });
        });

        describe('when emailAddress is NOT defined in event', () => {
            it('should log error about missing emailAddress', async () => {
                event = new PersonDeletedEvent(personId, username, undefined);

                await sut.handlePersonDeletedEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    'Cannot Create OX-delete-user-request, Email-Address Is Not Defined',
                );
            });
        });

        describe('when EmailAddress-entity CANNOT be found via address', () => {
            it('should log error about that', async () => {
                event = new PersonDeletedEvent(personId, username, faker.internet.email());

                emailRepoMock.findByAddress.mockResolvedValueOnce(undefined);

                await sut.handlePersonDeletedEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Cannot Create OX-delete-user-request For address:${event.emailAddress} Could Not Be Found`,
                );
            });
        });

        describe('when oxUserId is NOT defined on found EmailAddress', () => {
            it('should log error about missing oxUserId', async () => {
                event = new PersonDeletedEvent(personId, username, faker.internet.email());
                const emailMock: EmailAddress<true> = DoFactory.createEmailAddress(
                    false,
                ) as unknown as EmailAddress<true>; // cast necessary, because persisted EmailAddress has oxUserID defined
                emailRepoMock.findByAddress.mockResolvedValueOnce(emailMock);
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        status: {
                            code: 'success',
                        },
                        data: undefined,
                    },
                });

                await sut.handlePersonDeletedEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Cannot Create OX-delete-user-request For address:${event.emailAddress}, OxUserId Is Not Defined`,
                );
            });
        });

        describe('when delete-request to OX fails', () => {
            it('should log error about failing request', async () => {
                event = new PersonDeletedEvent(personId, username, faker.internet.email());
                const oxUserId: OXUserID = faker.string.numeric();

                emailRepoMock.findByAddress.mockResolvedValueOnce(
                    DoFactory.createEmailAddress(true, undefined, {
                        oxUserID: oxUserId,
                    }),
                );

                // Mock group retrieval successfully
                mockGroupRetrievalRequestSuccessful(oxUserId);

                // Mock removal as member from oxGroups successfully
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        status: {
                            code: 'success',
                        },
                        data: undefined,
                    },
                });

                // Mock delete request fails
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: new OxError(),
                });

                await sut.handlePersonDeletedEvent(event);

                expect(loggerMock.errorPersonalized).toHaveBeenCalledWith(
                    `Could Not Delete OxAccount For oxUserId:${oxUserId}, error:Unknown OX-error`,
                    personIdentifier,
                );
            });
        });

        describe('when delete-request to OX succeeds', () => {
            it('should log info about success', async () => {
                event = new PersonDeletedEvent(personId, username, faker.internet.email());
                const oxUserId: OXUserID = faker.string.numeric();

                emailRepoMock.findByAddress.mockResolvedValueOnce(
                    DoFactory.createEmailAddress(true, undefined, {
                        oxUserID: oxUserId,
                    }),
                );

                // Mock group retrieval successfully
                mockGroupRetrievalRequestSuccessful(oxUserId);

                // Mock removal as member from oxGroups successfully
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        status: {
                            code: 'success',
                        },
                        data: undefined,
                    },
                });

                // Mock delete request succeeds
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });

                await sut.handlePersonDeletedEvent(event);

                expect(loggerMock.infoPersonalized).toHaveBeenCalledWith(
                    `Successfully Deleted OxAccount For oxUserId:${oxUserId}`,
                    personIdentifier,
                );
            });
        });
    });

    describe('handleEmailAddressMarkedForDeletionEvent', () => {
        const contextId: OXContextID = '10';
        const contextName: OXContextName = 'testContext';

        let personId: PersonID;
        let username: PersonUsername;
        let oxUserId: OXUserID;
        let emailAddressId: EmailAddressID;
        let status: EmailAddressStatus;
        let address: string;
        let event: EmailAddressMarkedForDeletionEvent;

        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            username = faker.internet.username();
            oxUserId = faker.string.numeric();
            emailAddressId = faker.string.uuid();
            status = EmailAddressStatus.DISABLED;
            address = faker.internet.email();
            event = new EmailAddressMarkedForDeletionEvent(
                personId,
                username,
                oxUserId,
                emailAddressId,
                status,
                address,
            );
        });

        describe('when handler is disabled', () => {
            it('should log and skip processing when not enabled', async () => {
                sut.ENABLED = false;
                await sut.handleEmailAddressMarkedForDeletionEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Received EmailAddressMarkedForDeletionEvent, personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}`,
                );
                expect(loggerMock.info).toHaveBeenCalledWith('Not enabled, ignoring event');
            });
        });

        describe('when getting current user-data from OX fails because no such user exists (anymore)', () => {
            it('should log error about that', async () => {
                //mock: get-user-data fails
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: new OxNoSuchUserError('faultstring'),
                });
                await sut.handleEmailAddressMarkedForDeletionEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `User already deleted in OX, publishing (Kafka)OxEmailAddressDeleted-event, personId:${event.personId}, username:${event.username}`,
                );
            });
        });

        describe('when getting current user-data from OX fails', () => {
            it('should log error about that', async () => {
                //mock: get-user-data fails
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: new OxError(),
                });
                await sut.handleEmailAddressMarkedForDeletionEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Cannot get data for oxUsername:${event.username} from OX, Aborting Email-Address Removal, personId:${event.personId}, username:${event.username}`,
                );
            });
        });

        describe('when getting current user-data from OX succeeds and aliases contains address', () => {
            it('should log infos about that', async () => {
                const aliases: string[] = [faker.internet.email(), address];
                const userData: GetDataForUserResponse = getGetDataForUserResponse(
                    oxUserId,
                    username,
                    address,
                    aliases,
                );
                //mock: get-user-data succeeds
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: userData,
                });
                //mock: change-user-data succeeds
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });
                await sut.handleEmailAddressMarkedForDeletionEvent(event);
                await vi.runAllTimersAsync();

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Found Current aliases:${JSON.stringify(aliases)}, personId:${event.personId}, username:${event.username}`,
                );
                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Removed From alias:${event.address}, personId:${event.personId}, username:${event.username}`,
                );
                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Successfully Removed EmailAddress from OxAccount, personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}`,
                );
                expect(eventServiceMock.publish).toHaveBeenCalledWith(
                    expect.objectContaining({
                        personId: event.personId,
                        oxUserId: event.oxUserId,
                        username: event.username,
                        address: event.address,
                        oxContextId: contextId,
                        oxContextName: contextName,
                    }),
                    expect.objectContaining({
                        personId: event.personId,
                        oxUserId: event.oxUserId,
                        username: event.username,
                        address: event.address,
                        oxContextId: contextId,
                        oxContextName: contextName,
                    }),
                );
            });
        });

        describe('when personId is set in event', () => {
            it('should add found email to aliases and set it as primary', async () => {
                const dbEmail: string = faker.internet.email();
                const aliases: string[] = [address];
                const userData: GetDataForUserResponse = getGetDataForUserResponse(
                    oxUserId,
                    username,
                    address,
                    aliases,
                );
                //mock: get-user-data succeeds
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: userData,
                });
                //mock: change-user-data succeeds
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });
                emailRepoMock.findEnabledByPerson.mockResolvedValueOnce(DoFactory.createEmailAddress(true, dbEmail));
                await sut.handleEmailAddressMarkedForDeletionEvent(event);
                await vi.runAllTimersAsync();

                expect(oxServiceMock.send).toHaveBeenLastCalledWith(
                    expect.objectContaining({
                        params: expect.objectContaining({
                            userId: oxUserId,
                            contextId: contextId,
                            username: undefined,
                            aliases: [dbEmail],
                            givenname: undefined,
                            surname: undefined,
                            displayname: undefined,
                            defaultSenderAddress: dbEmail,
                            primaryEmail: dbEmail,
                            email1: dbEmail,
                        }) as ChangeUserParams,
                    }),
                );
            });

            it('should skip setting primary if none exists', async () => {
                const existingMail: string = faker.internet.email();
                const aliases: string[] = [existingMail, address];
                const userData: GetDataForUserResponse = getGetDataForUserResponse(
                    oxUserId,
                    username,
                    address,
                    aliases,
                );
                //mock: get-user-data succeeds
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: userData,
                });
                //mock: change-user-data succeeds
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });
                emailRepoMock.findEnabledByPerson.mockResolvedValueOnce(undefined);
                await sut.handleEmailAddressMarkedForDeletionEvent(event);
                await vi.runAllTimersAsync();

                expect(oxServiceMock.send).toHaveBeenLastCalledWith(
                    expect.objectContaining({
                        params: expect.objectContaining({
                            userId: oxUserId,
                            contextId: contextId,
                            username: undefined,
                            aliases: [existingMail],
                            givenname: undefined,
                            surname: undefined,
                            displayname: undefined,
                            defaultSenderAddress: existingMail,
                            primaryEmail: existingMail,
                            email1: existingMail,
                        }) as ChangeUserParams,
                    }),
                );
            });
        });

        it('should skip ox-request if the removed mail is the last one', async () => {
            const aliases: string[] = [address];
            const event: EmailAddressMarkedForDeletionEvent = new EmailAddressMarkedForDeletionEvent(
                undefined,
                username,
                oxUserId,
                emailAddressId,
                status,
                address,
            );
            const userData: GetDataForUserResponse = getGetDataForUserResponse(oxUserId, username, address, aliases);
            //mock: get-user-data succeeds
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: userData,
            });
            //mock: change-user-data succeeds
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            });
            emailRepoMock.findEnabledByPerson.mockResolvedValueOnce(undefined);
            await sut.handleEmailAddressMarkedForDeletionEvent(event);
            await vi.runAllTimersAsync();

            expect(loggerMock.info).toHaveBeenCalledWith(
                `Could Not Remove EmailAddress from OxAccount because user would not have any more addresses, treat address as deleted. personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}`,
            );
            expect(eventServiceMock.publish).toHaveBeenCalledWith(
                expect.objectContaining({
                    personId: undefined,
                    username: username,
                    oxUserId: oxUserId,
                }),
                expect.objectContaining({
                    personId: undefined,
                    username: username,
                    oxUserId: oxUserId,
                }),
            );
        });

        describe('when getting current user-data from OX succeeds but changing user-data fails', () => {
            it('should log error about that', async () => {
                const aliases: string[] = [faker.internet.email(), address];
                const userData: GetDataForUserResponse = getGetDataForUserResponse(
                    oxUserId,
                    username,
                    address,
                    aliases,
                );
                //mock: get-user-data succeeds
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: userData,
                });
                const oxError: OxError = new OxError();
                //mock: change-user-data fails
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: oxError,
                });
                await sut.handleEmailAddressMarkedForDeletionEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Could Not Remove EmailAddress from OxAccount, personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}, error:${oxError.message}`,
                );
            });
        });
    });

    describe('handleEmailAddressesPurgedEvent', () => {
        let personId: PersonID;
        let username: PersonUsername;
        let personIdentifier: PersonIdentifier;
        let oxUserId: OXUserID;
        let event: EmailAddressesPurgedEvent;

        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            username = faker.internet.username();
            personIdentifier = {
                personId: personId,
                username: username,
            };
            oxUserId = faker.string.numeric();
            event = new EmailAddressesPurgedEvent(personId, username, oxUserId);
        });

        describe('when handler is disabled', () => {
            it('should log and skip processing when not enabled', async () => {
                sut.ENABLED = false;
                await sut.handleEmailAddressesPurgedEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Received EmailAddressesPurgedEvent, personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}`,
                );
                expect(loggerMock.info).toHaveBeenCalledWith('Not enabled, ignoring event');
            });
        });

        describe('when delete-request to OX fails', () => {
            it('should log error about failure', async () => {
                // Mock group retrieval successfully
                mockGroupRetrievalRequestSuccessful(oxUserId);

                // Mock removal as member from oxGroups successfully
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        status: {
                            code: 'success',
                        },
                        data: undefined,
                    },
                });

                const error: OxError = new OxError();
                // Mock delete request fails
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: error,
                });

                await sut.handleEmailAddressesPurgedEvent(event);

                expect(loggerMock.errorPersonalized).toHaveBeenCalledWith(
                    `Could Not Delete OxAccount For oxUserId:${event.oxUserId}, error:${error.message}`,
                    personIdentifier,
                );
            });
        });

        describe('when delete-request to OX succeeds', () => {
            it('should log info about success', async () => {
                // Mock group retrieval successfully
                mockGroupRetrievalRequestSuccessful(oxUserId);

                // Mock removal as member from oxGroups successfully
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        status: {
                            code: 'success',
                        },
                        data: undefined,
                    },
                });

                // Mock delete request succeeds
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });

                await sut.handleEmailAddressesPurgedEvent(event);

                expect(eventServiceMock.publish).toHaveBeenCalledWith(
                    expect.objectContaining({
                        personId: personId,
                        username: username,
                        oxUserId: oxUserId,
                    }),
                    expect.objectContaining({
                        personId: personId,
                        username: username,
                        oxUserId: oxUserId,
                    }),
                );
                expect(loggerMock.infoPersonalized).toHaveBeenCalledWith(
                    `Successfully Deleted OxAccount For oxUserId:${event.oxUserId}`,
                    personIdentifier,
                );
            });
        });
    });

    describe('handleEmailAddressDisabledEvent', () => {
        let personId: PersonID;
        let username: string;
        let personIdentifier: PersonIdentifier;
        let oxUserId: OXUserID;
        let event: EmailAddressDisabledEvent;
        let person: Person<true>;
        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            username = faker.internet.username();
            personIdentifier = {
                personId: personId,
                username: username,
            };
            oxUserId = faker.string.numeric();
            event = new EmailAddressDisabledEvent(personId, username);
            person = DoFactory.createPerson(true, {
                id: personId,
                email: faker.internet.email(),
                username: username,
                oxUserId: oxUserId,
            });
        });
        describe('when handler is disabled', () => {
            it('should log and skip processing when not enabled', async () => {
                sut.ENABLED = false;
                await sut.handleEmailAddressDisabledEvent(event);
                expect(loggerMock.info).toHaveBeenCalledWith('Not enabled, ignoring event');
            });
        });
        describe('when person is not found', () => {
            it('should log error if person does not exist', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(undefined);
                await sut.handleEmailAddressDisabledEvent(event);
                expect(loggerMock.error).toHaveBeenCalledWith(`Could Not Find Person For personId:${event.personId}`);
            });
        });
        describe('when person is found BUT has NO oxUserId', () => {
            it('should log error if person does not have a oxUserId', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createPerson(true, { oxUserId: undefined }),
                );
                await sut.handleEmailAddressDisabledEvent(event);
                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Could Not Remove Person From OxGroups, No OxUserId For personId:${event.personId}`,
                );
            });
        });
        describe('when listing groups for user fails', () => {
            it('should log error', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                //mock listing groups results in error
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: new OxError(),
                });
                await sut.handleEmailAddressDisabledEvent(event);
                expect(loggerMock.errorPersonalized).toHaveBeenCalledWith(
                    `Retrieving OxGroups For OxUser Failed`,
                    personIdentifier,
                );
            });
        });
        describe('when removing user from groups fails for at least one group', () => {
            it('should log error', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                //mock listing groups
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        groups: [
                            {
                                displayname: 'group1-displayname',
                                id: 'group1-id',
                                name: 'group1-name',
                                memberIds: [oxUserId],
                            },
                            {
                                displayname: 'group2-displayname',
                                id: 'group2-id',
                                name: 'group2-name',
                                memberIds: [oxUserId],
                            },
                        ],
                    },
                });
                //mock removing member from group-1 succeeds
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        status: {
                            code: 'success',
                        },
                        data: 'body',
                    },
                });
                //mock removing member from group-2 results in error
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: new OxError(),
                });
                await sut.handleEmailAddressDisabledEvent(event);
                expect(loggerMock.infoPersonalized).toHaveBeenCalledWith(
                    `Successfully Removed OxUser From OxGroup, oxUserId:${oxUserId}, oxGroupId:group1-id`,
                    personIdentifier,
                );
                expect(loggerMock.errorPersonalized).toHaveBeenCalledWith(
                    `Could Not Remove OxUser From OxGroup, oxUserId:${oxUserId}, oxGroupId:group2-id`,
                    personIdentifier,
                );
            });
        });
    });

    describe('handlePersonenkontextUpdatedEvent', () => {
        let personId: PersonID;
        let username: PersonUsername;
        let personIdentifier: PersonIdentifier;
        let oxUserId: OXUserID;
        let oxGroupId: OXGroupID;
        let rollenArtLehrPKOrgaKennung: OrganisationKennung;
        let event: PersonenkontextUpdatedEvent;
        let person: Person<true>;
        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            username = faker.internet.username();
            personIdentifier = {
                personId: personId,
                username: username,
            };
            rollenArtLehrPKOrgaKennung = faker.string.numeric(7);
            oxUserId = faker.string.numeric();
            oxGroupId = faker.string.numeric();
            event = getPersonenkontextUpdatedEvent(personId, rollenArtLehrPKOrgaKennung, true);
        });
        describe('when handler is disabled', () => {
            it('should log and skip processing when not enabled', async () => {
                sut.ENABLED = false;
                await sut.handlePersonenkontextUpdatedEvent(event);
                expect(loggerMock.info).toHaveBeenCalledWith('Not enabled, ignoring event');
            });
        });
        describe('when person CANNOT be found', () => {
            it('should log error about that', async () => {
                personRepositoryMock.findById.mockResolvedValue(undefined);
                await sut.handlePersonenkontextUpdatedEvent(event);
                expect(loggerMock.error).toHaveBeenCalledWith(`Could Not Find Person For personId:${event.person.id}`);
            });
        });
        describe('when oxUserId is NOT defined', () => {
            it('should log error about that', async () => {
                person = DoFactory.createPerson(true, {
                    email: faker.internet.email(),
                    username: username,
                    oxUserId: undefined,
                });
                personRepositoryMock.findById.mockResolvedValue(person);
                await sut.handlePersonenkontextUpdatedEvent(event);
                expect(loggerMock.error).toHaveBeenCalledWith(`OxUserId Not Defined For personId:${event.person.id}`);
            });
        });
        describe('when getting oxGroupId by oxGroupName fails', () => {
            it('should log error about that', async () => {
                person = DoFactory.createPerson(true, { id: personId, username, oxUserId });
                //mock Ox-getOxGroupByName-request results in an error
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: new OxError(),
                });
                personRepositoryMock.findById.mockResolvedValue(person);
                await sut.handlePersonenkontextUpdatedEvent(event);
                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Could Not Get OxGroupId For oxGroupName:${'lehrer-' + rollenArtLehrPKOrgaKennung}`,
                );
            });
        });
        describe('when removing user as member from oxGroup is successful', () => {
            it('should log info about that', async () => {
                person = DoFactory.createPerson(true, { id: personId, username, oxUserId });
                personRepositoryMock.findById.mockResolvedValue(person);
                // Mock group retrieval successfully
                mockGroupRetrievalRequestSuccessful(oxUserId, oxGroupId);
                //mock Ox-removeOxUserFromOxGroup-request is successful
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        status: {
                            code: 'success',
                        },
                        data: undefined,
                    },
                });
                await sut.handlePersonenkontextUpdatedEvent(event);
                expect(loggerMock.infoPersonalized).toHaveBeenCalledWith(
                    `Successfully Removed OxUser From OxGroup, oxUserId:${oxUserId}, oxGroupId:${oxGroupId}`,
                    personIdentifier,
                );
            });
        });
    });

    describe('handlePersonDeletedAfterDeadlineExceededEvent', () => {
        let personId: PersonID;
        let username: PersonUsername;
        let oxUserId: OXUserID;
        let event: PersonDeletedAfterDeadlineExceededEvent;
        let person: Person<true>;
        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            username = faker.internet.username();
            oxUserId = faker.string.numeric();
            event = new PersonDeletedAfterDeadlineExceededEvent(personId, username, oxUserId);
        });

        describe('when handler is disabled', () => {
            it('should log and skip processing when not enabled', async () => {
                sut.ENABLED = false;
                await sut.handlePersonDeletedAfterDeadlineExceededEvent(event);
                expect(loggerMock.info).toHaveBeenCalledWith('Not enabled, ignoring event');
            });
        });

        describe('when user has no remaining PKs with rollenArt LEHR in currentKontexte', () => {
            describe('should change username in OX to personId, when change fails', () => {
                it('should log error', async () => {
                    person = DoFactory.createPerson(true, { id: personId, username, oxUserId });
                    personRepositoryMock.findById.mockResolvedValue(person);
                    const oxError: OxError = new OxError();
                    //mock Ox-changeUser-request fails
                    oxServiceMock.send.mockResolvedValueOnce({
                        ok: false,
                        error: oxError,
                    });

                    await sut.handlePersonDeletedAfterDeadlineExceededEvent(event);

                    expect(loggerMock.error).toHaveBeenCalledWith(
                        `Could Not Change OxUsername, personId:${personId}, username:${username}, oxUserId:${oxUserId} After PersonDeletedAfterDeadlineExceededEvent, error:${oxError.message}`,
                    );
                });
            });
            describe('should change username in OX to personId, when change succeeds', () => {
                it('should log info', async () => {
                    person = DoFactory.createPerson(true, { id: personId, username, oxUserId });
                    personRepositoryMock.findById.mockResolvedValue(person);
                    //mock Ox-changeUser-request is successful
                    oxServiceMock.send.mockResolvedValueOnce({
                        ok: true,
                        value: {
                            status: {
                                code: 'success',
                            },
                            data: undefined,
                        },
                    });

                    await sut.handlePersonDeletedAfterDeadlineExceededEvent(event);

                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `Successfully Changed OxUsername, personId:${personId}, username:${username}, oxUserId:${oxUserId} After PersonDeletedAfterDeadlineExceededEvent`,
                    );
                });
            });
        });
    });

    describe('handleOrganisationDeletedEvent', () => {
        let organisation: Organisation<true>;
        let event: OrganisationDeletedEvent;

        beforeEach(() => {
            vi.resetAllMocks();
            organisation = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            event = OrganisationDeletedEvent.fromOrganisation(organisation);
        });

        function getMockGroupsResponse(oxGroupId: string): ListGroupsResponse {
            return {
                groups: [
                    {
                        id: oxGroupId,
                        displayname: '',
                        memberIds: [],
                        name: '',
                    },
                ],
            };
        }

        describe('when handler is disabled', () => {
            it('should log and skip processing when not enabled', async () => {
                sut.ENABLED = false;
                await sut.handleOrganisationDeletedEvent(event);
                expect(loggerMock.info).toHaveBeenCalledWith('Not enabled, ignoring event');
            });
        });

        describe('when email microservice is enabled', () => {
            it('should ignore the event when the email microservice is enabled', async () => {
                vi.resetAllMocks();
                emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(true);

                await sut.handleOrganisationDeletedEvent(event);
                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Ignoring Event for organisationId:${event.organisationId} because email microservice is enabled`,
                );
            });
        });

        describe('when event is incomplete', () => {
            const MESSAGE: string = 'OrganisationDeletedEvent does not apply, ignoring event';
            it('should log and skip processing when kennung is missing', async () => {
                event = OrganisationDeletedEvent.fromOrganisation({ ...organisation, kennung: undefined });
                await sut.handleOrganisationDeletedEvent(event);
                expect(loggerMock.info).toHaveBeenLastCalledWith(MESSAGE);
            });
            it('should log and skip processing when typ is missing', async () => {
                event = OrganisationDeletedEvent.fromOrganisation({ ...organisation, typ: undefined });
                await sut.handleOrganisationDeletedEvent(event);
                expect(loggerMock.info).toHaveBeenLastCalledWith(MESSAGE);
            });
            it('should log and skip processing when typ is not SCHULE', async () => {
                event = OrganisationDeletedEvent.fromOrganisation({ ...organisation, typ: OrganisationsTyp.ROOT });
                await sut.handleOrganisationDeletedEvent(event);
                expect(loggerMock.info).toHaveBeenLastCalledWith(MESSAGE);
            });
        });

        describe('when action succeds', () => {
            it('should log info', async () => {
                const oxGroupId: string = faker.string.uuid();
                const oxLehrerGroupName: string = 'lehrer-' + event.kennung;
                const mockGroupsResponse: ListGroupsResponse = getMockGroupsResponse(oxGroupId);
                oxServiceMock.send.mockResolvedValueOnce(Ok(mockGroupsResponse)); // getOxGroupByName
                oxServiceMock.send.mockResolvedValueOnce(Ok(undefined)); // removeOxGroup
                await sut.handleOrganisationDeletedEvent(event);
                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Received OrganisationDeletedEvent, organisationId:${event.organisationId}, name:${event.name}, kennung:${event.kennung}, typ:${event.typ}`,
                );
                expect(loggerMock.info).toHaveBeenLastCalledWith(
                    `Successfully Deleted OxGroup ${oxLehrerGroupName}, oxGroupId:${oxGroupId}`,
                );
            });
        });

        describe('when action fails', () => {
            it.each([
                ['OxGroupNotFoundError', new OxGroupNotFoundError('not found')],
                ['OxError', new OxError('generic error')],
            ])('should log %s, when group can not be found', async (_label: string, error: OxError) => {
                const oxLehrerGroupName: string = 'lehrer-' + event.kennung;
                oxServiceMock.send.mockResolvedValueOnce(Err(error)); // getOxGroupByName
                await sut.handleOrganisationDeletedEvent(event);
                expect(loggerMock.logUnknownAsError).toHaveBeenLastCalledWith(
                    `Could Not Find OxGroup ${oxLehrerGroupName} for Deletion`,
                    error,
                );
            });

            it('should log error, when group can not be deleted', async () => {
                const oxGroupId: string = faker.string.uuid();
                const oxLehrerGroupName: string = 'lehrer-' + event.kennung;
                const mockError: OxGroupNotFoundError = new OxGroupNotFoundError('not found');
                const mockGroupsResponse: ListGroupsResponse = getMockGroupsResponse(oxGroupId);
                oxServiceMock.send.mockResolvedValueOnce(Ok(mockGroupsResponse)); // getOxGroupByName
                oxServiceMock.send.mockResolvedValueOnce(Err(mockError)); // removeOxGroup
                await sut.handleOrganisationDeletedEvent(event);
                expect(loggerMock.logUnknownAsError).toHaveBeenLastCalledWith(
                    `Could Not Delete OxGroup ${oxLehrerGroupName}, oxGroupId:${oxGroupId}`,
                    mockError,
                );
            });
        });
    });
});
