import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';

import { ConfigTestModule, DatabaseTestModule, DoFactory, LoggingTestModule } from '../../../../test/utils/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { ItsLearningError } from '../../../shared/error/its-learning.error.js';
import { RolleUpdatedEvent } from '../../../shared/events/rolle-updated.event.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { type Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { type Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { type ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { type FailureStatusInfo } from '../adapter/technical/actions/base-mass-action.js';
import { ItslearningMembershipAdapter } from '../adapter/domain/itslearning-membership.adapter.js';
import { ItslearningPersonAdapter } from '../adapter/domain/itslearning-person.adapter.js';
import { ItsLearningRolleEventHandler } from './itslearning-rolle.event-handler.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { EmailRepo } from '../../email/persistence/email.repo.js';
import { EmailAddressStatus } from '../../email/domain/email-address.js';
import { DomainErrorMock } from '../../../../test/utils/error.mock.js';

function createStatusFailure(message: string): FailureStatusInfo {
    return {
        codeMajor: 'failure',
        severity: 'error',
        codeMinor: {
            codeMinorField: [
                {
                    codeMinorName: 'create',
                    codeMinorValue: 'fail',
                },
            ],
        },
        description: {
            language: 'en',
            text: message,
        },
    };
}

describe('ItsLearning Rolle Event Handler', () => {
    let module: TestingModule;

    let sut: ItsLearningRolleEventHandler;
    let itslearningPersonAdapterMock: DeepMocked<ItslearningPersonAdapter>;
    let itslearningMembershipAdapterMock: DeepMocked<ItslearningMembershipAdapter>;
    let personRepoMock: DeepMocked<PersonRepository>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let serviceProviderRepoMock: DeepMocked<ServiceProviderRepo>;
    let loggerMock: DeepMocked<ClassLogger>;
    let emailRepoMock: DeepMocked<EmailRepo>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule, DatabaseTestModule.forRoot()],
            providers: [
                ItsLearningRolleEventHandler,
                {
                    provide: EmailRepo,
                    useValue: createMock(EmailRepo),
                },
                {
                    provide: EmailResolverService,
                    useValue: createMock(EmailResolverService),
                },
                {
                    provide: ItslearningPersonAdapter,
                    useValue: createMock(ItslearningPersonAdapter),
                },
                {
                    provide: ItslearningMembershipAdapter,
                    useValue: createMock(ItslearningMembershipAdapter),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: ServiceProviderRepo,
                    useValue: createMock(ServiceProviderRepo),
                },
            ],
        }).compile();

        sut = module.get(ItsLearningRolleEventHandler);
        emailRepoMock = module.get(EmailRepo);
        emailResolverServiceMock = module.get(EmailResolverService);
        itslearningPersonAdapterMock = module.get(ItslearningPersonAdapter);
        itslearningMembershipAdapterMock = module.get(ItslearningMembershipAdapter);
        personRepoMock = module.get(PersonRepository);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        serviceProviderRepoMock = module.get(ServiceProviderRepo);
        loggerMock = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        sut.ENABLED = true;
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('rolleUpdatedEventHandler', () => {
        function createEvent(newSpIds: string[], oldSpIds: string[]): RolleUpdatedEvent {
            return new RolleUpdatedEvent(
                faker.string.uuid(),
                faker.helpers.enumValue(RollenArt),
                faker.word.noun(),
                faker.string.uuid(),
                [],
                [],
                newSpIds,

                faker.word.noun(),
                faker.string.uuid(),
                [],
                [],
                oldSpIds,
            );
        }

        describe('when itslearning status is unchanged', () => {
            it('should log info and return, if itslearning was removed and added at the same time', async () => {
                const spA: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                });
                const spB: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                });
                const event: RolleUpdatedEvent = createEvent([spA.id], [spB.id]);
                serviceProviderRepoMock.findByIds.mockResolvedValueOnce(
                    new Map([
                        [spA.id, spA],
                        [spB.id, spB],
                    ]),
                );

                await sut.rolleUpdatedEventHandler(event, () => {});

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Itslearning status did not change during RoleUpdatedEvent, ignoring.`,
                );
            });

            it('should log info and return, if itslearning was neither added nor removed', async () => {
                const spA: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.NONE,
                });
                const spB: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.NONE,
                });
                const event: RolleUpdatedEvent = createEvent([spA.id], [spB.id]);
                serviceProviderRepoMock.findByIds.mockResolvedValueOnce(
                    new Map([
                        [spA.id, spA],
                        [spB.id, spB],
                    ]),
                );

                await sut.rolleUpdatedEventHandler(event, () => {});

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Itslearning status did not change during RoleUpdatedEvent, ignoring.`,
                );
            });
        });

        describe('when itslearning was added', () => {
            it('should get persons and kontexte from db and send them to itslearning using email repo', async () => {
                emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);
                const spA: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                });
                serviceProviderRepoMock.findByIds.mockResolvedValueOnce(new Map([[spA.id, spA]]));
                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor.mockResolvedValueOnce([
                    [person],
                    undefined,
                ]);
                itslearningPersonAdapterMock.createOrUpdatePersons.mockResolvedValueOnce(
                    Ok({ status: [], value: undefined }),
                );
                const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
                personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor.mockResolvedValueOnce([
                    [personenkontext],
                    undefined,
                ]);
                itslearningMembershipAdapterMock.createMembershipsMass.mockResolvedValueOnce(
                    Ok({ status: [], value: undefined }),
                );

                const event: RolleUpdatedEvent = createEvent([spA.id], []);

                emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                    ok: true,
                    value: new Map([
                        [
                            person.id,
                            {
                                address: faker.internet.email(),
                                status: EmailAddressStatus.ENABLED,
                            },
                        ],
                    ]),
                });

                await sut.rolleUpdatedEventHandler(event, () => {});

                expect(emailResolverServiceMock.shouldUseEmailMicroservice).toHaveBeenCalled();
                expect(emailRepoMock.getEmailAddressAndStatusForPersonIds).toHaveBeenCalledWith([person.id]);

                expect(personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor).toHaveBeenCalledWith(
                    event.id,
                    expect.any(Number),
                    undefined,
                );
                expect(itslearningPersonAdapterMock.createOrUpdatePersons).toHaveBeenCalledWith(
                    [expect.objectContaining({ id: person.id })],
                    event.eventID,
                );
                expect(personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor).toHaveBeenCalledWith(
                    event.id,
                    expect.any(Number),
                    undefined,
                );
                expect(itslearningMembershipAdapterMock.createMembershipsMass).toHaveBeenCalledWith(
                    [
                        expect.objectContaining({
                            groupId: personenkontext.organisationId,
                            personId: personenkontext.personId,
                        }),
                    ],
                    event.eventID,
                );
            });

            it('should send undefined email when repo returns email with DISABLED status', async () => {
                emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);

                const spA: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                });
                serviceProviderRepoMock.findByIds.mockResolvedValueOnce(new Map([[spA.id, spA]]));

                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor.mockResolvedValueOnce([
                    [person],
                    undefined,
                ]);

                itslearningPersonAdapterMock.createOrUpdatePersons.mockResolvedValueOnce(
                    Ok({ status: [], value: undefined }),
                );

                const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
                personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor.mockResolvedValueOnce([
                    [personenkontext],
                    undefined,
                ]);

                itslearningMembershipAdapterMock.createMembershipsMass.mockResolvedValueOnce(
                    Ok({ status: [], value: undefined }),
                );

                const event: RolleUpdatedEvent = createEvent([spA.id], []);

                emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                    ok: true,
                    value: new Map([
                        [
                            person.id,
                            {
                                address: faker.internet.email(),
                                status: EmailAddressStatus.DISABLED,
                            },
                        ],
                    ]),
                });

                await sut.rolleUpdatedEventHandler(event, () => {});

                expect(emailResolverServiceMock.shouldUseEmailMicroservice).toHaveBeenCalled();
                expect(emailRepoMock.getEmailAddressAndStatusForPersonIds).toHaveBeenCalledWith([person.id]);

                expect(itslearningPersonAdapterMock.createOrUpdatePersons).toHaveBeenCalledWith(
                    [
                        expect.objectContaining({
                            id: person.id,
                            email: undefined,
                        }),
                    ],
                    event.eventID,
                );

                expect(itslearningMembershipAdapterMock.createMembershipsMass).toHaveBeenCalled();
            });

            it('should get persons and kontexte from db and send them to itslearning using email repo with email map no entry', async () => {
                emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);
                const spA: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                });
                serviceProviderRepoMock.findByIds.mockResolvedValueOnce(new Map([[spA.id, spA]]));
                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor.mockResolvedValueOnce([
                    [person],
                    undefined,
                ]);
                itslearningPersonAdapterMock.createOrUpdatePersons.mockResolvedValueOnce(
                    Ok({ status: [], value: undefined }),
                );
                const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
                personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor.mockResolvedValueOnce([
                    [personenkontext],
                    undefined,
                ]);
                itslearningMembershipAdapterMock.createMembershipsMass.mockResolvedValueOnce(
                    Ok({ status: [], value: undefined }),
                );

                const event: RolleUpdatedEvent = createEvent([spA.id], []);

                emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                    ok: true,
                    value: new Map(),
                });

                await sut.rolleUpdatedEventHandler(event, () => {});

                expect(emailResolverServiceMock.shouldUseEmailMicroservice).toHaveBeenCalled();
                expect(emailRepoMock.getEmailAddressAndStatusForPersonIds).toHaveBeenCalledWith([person.id]);

                expect(personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor).toHaveBeenCalledWith(
                    event.id,
                    expect.any(Number),
                    undefined,
                );
                expect(itslearningPersonAdapterMock.createOrUpdatePersons).toHaveBeenCalledWith(
                    [expect.objectContaining({ id: person.id, email: undefined })],
                    event.eventID,
                );
                expect(personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor).toHaveBeenCalledWith(
                    event.id,
                    expect.any(Number),
                    undefined,
                );
                expect(itslearningMembershipAdapterMock.createMembershipsMass).toHaveBeenCalledWith(
                    [
                        expect.objectContaining({
                            groupId: personenkontext.organisationId,
                            personId: personenkontext.personId,
                        }),
                    ],
                    event.eventID,
                );
            });

            it('should get persons and kontexte from db and send them to itslearning using email repo and email fetch fails', async () => {
                emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);
                const spA: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                });
                serviceProviderRepoMock.findByIds.mockResolvedValueOnce(new Map([[spA.id, spA]]));
                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor.mockResolvedValueOnce([
                    [person],
                    undefined,
                ]);
                itslearningPersonAdapterMock.createOrUpdatePersons.mockResolvedValueOnce(
                    Ok({ status: [], value: undefined }),
                );
                const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
                personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor.mockResolvedValueOnce([
                    [personenkontext],
                    undefined,
                ]);
                itslearningMembershipAdapterMock.createMembershipsMass.mockResolvedValueOnce(
                    Ok({ status: [], value: undefined }),
                );

                const event: RolleUpdatedEvent = createEvent([spA.id], []);

                emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                    ok: false,
                    error: new DomainErrorMock('Email fetch failed'),
                });

                await sut.rolleUpdatedEventHandler(event, () => {});

                expect(emailResolverServiceMock.shouldUseEmailMicroservice).toHaveBeenCalled();
                expect(emailRepoMock.getEmailAddressAndStatusForPersonIds).toHaveBeenCalledWith([person.id]);

                expect(personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor).toHaveBeenCalledWith(
                    event.id,
                    expect.any(Number),
                    undefined,
                );
                expect(itslearningPersonAdapterMock.createOrUpdatePersons).toHaveBeenCalledWith(
                    [expect.objectContaining({ id: person.id })],
                    event.eventID,
                );
                expect(personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor).toHaveBeenCalledWith(
                    event.id,
                    expect.any(Number),
                    undefined,
                );
                expect(itslearningMembershipAdapterMock.createMembershipsMass).toHaveBeenCalledWith(
                    [
                        expect.objectContaining({
                            groupId: personenkontext.organisationId,
                            personId: personenkontext.personId,
                        }),
                    ],
                    event.eventID,
                );
            });

            it('should get persons and kontexte from db and send them to itslearning using email microservice', async () => {
                emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
                const spA: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                });
                serviceProviderRepoMock.findByIds.mockResolvedValueOnce(new Map([[spA.id, spA]]));
                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor.mockResolvedValueOnce([
                    [person],
                    undefined,
                ]);
                itslearningPersonAdapterMock.createOrUpdatePersons.mockResolvedValueOnce(
                    Ok({ status: [], value: undefined }),
                );
                const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
                personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor.mockResolvedValueOnce([
                    [personenkontext],
                    undefined,
                ]);
                itslearningMembershipAdapterMock.createMembershipsMass.mockResolvedValueOnce(
                    Ok({ status: [], value: undefined }),
                );

                const event: RolleUpdatedEvent = createEvent([spA.id], []);

                emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValue({
                    ok: true,
                    value: new Map([
                        [
                            person.id,
                            {
                                address: faker.internet.email(),
                                status: EmailAddressStatus.ENABLED,
                            },
                        ],
                    ]),
                });

                await sut.rolleUpdatedEventHandler(event, () => {});

                expect(emailResolverServiceMock.shouldUseEmailMicroservice).toHaveBeenCalled();
                expect(emailResolverServiceMock.findEmailsBySpshPersons).toHaveBeenCalledWith([person.id]);

                expect(personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor).toHaveBeenCalledWith(
                    event.id,
                    expect.any(Number),
                    undefined,
                );
                expect(itslearningPersonAdapterMock.createOrUpdatePersons).toHaveBeenCalledWith(
                    [expect.objectContaining({ id: person.id })],
                    event.eventID,
                );
                expect(personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor).toHaveBeenCalledWith(
                    event.id,
                    expect.any(Number),
                    undefined,
                );
                expect(itslearningMembershipAdapterMock.createMembershipsMass).toHaveBeenCalledWith(
                    [
                        expect.objectContaining({
                            groupId: personenkontext.organisationId,
                            personId: personenkontext.personId,
                        }),
                    ],
                    event.eventID,
                );
            });

            it('should log specific errors', async () => {
                emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);
                const spA: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                });
                serviceProviderRepoMock.findByIds.mockResolvedValueOnce(new Map([[spA.id, spA]]));
                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor.mockResolvedValueOnce([
                    [person],
                    undefined,
                ]);
                itslearningPersonAdapterMock.createOrUpdatePersons.mockResolvedValueOnce(
                    Ok({
                        status: [createStatusFailure('Input Error')],
                        value: undefined,
                    }),
                );
                const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
                personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor.mockResolvedValueOnce([
                    [personenkontext],
                    undefined,
                ]);
                itslearningMembershipAdapterMock.createMembershipsMass.mockResolvedValueOnce(
                    Ok({
                        status: [createStatusFailure('Input Error')],
                        value: undefined,
                    }),
                );

                const event: RolleUpdatedEvent = createEvent([spA.id], []);

                emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                    ok: true,
                    value: new Map([
                        [
                            person.id,
                            {
                                address: faker.internet.email(),
                                status: EmailAddressStatus.ENABLED,
                            },
                        ],
                    ]),
                });

                await sut.rolleUpdatedEventHandler(event, () => {});

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Creation of person ${person.username} failed with the following reason: Input Error`,
                );
                expect(loggerMock.error).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Could not give Rolle to person ${personenkontext.personId} at orga ${personenkontext.organisationId}, failed with the following reason: Input Error`,
                );
            });

            it('should log unexpected errors', async () => {
                emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);
                const spA: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                });
                serviceProviderRepoMock.findByIds.mockResolvedValueOnce(new Map([[spA.id, spA]]));
                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor.mockResolvedValueOnce([
                    [person],
                    undefined,
                ]);
                itslearningPersonAdapterMock.createOrUpdatePersons.mockResolvedValueOnce(
                    Err(new ItsLearningError('Unknown Error')),
                );
                const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
                personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor.mockResolvedValueOnce([
                    [personenkontext],
                    undefined,
                ]);
                itslearningMembershipAdapterMock.createMembershipsMass.mockResolvedValueOnce(
                    Err(new ItsLearningError('Unknown Error')),
                );

                const event: RolleUpdatedEvent = createEvent([spA.id], []);

                emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                    ok: true,
                    value: new Map([
                        [
                            person.id,
                            {
                                address: faker.internet.email(),
                                status: EmailAddressStatus.ENABLED,
                            },
                        ],
                    ]),
                });

                await sut.rolleUpdatedEventHandler(event, () => {});

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Creation of person ${person.username} failed with the following reason: Unknown Error`,
                );
                expect(loggerMock.error).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Could not give Rolle to person ${personenkontext.personId} at orga ${personenkontext.organisationId}, failed with the following reason: Unknown Error`,
                );
            });
        });

        describe('when itslearning was removed', () => {
            it('should get persons and kontexte from db and delete them from itslearning', async () => {
                const spA: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                });
                serviceProviderRepoMock.findByIds.mockResolvedValueOnce(new Map([[spA.id, spA]]));
                const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
                personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor.mockResolvedValueOnce([
                    [personenkontext],
                    undefined,
                ]);
                itslearningMembershipAdapterMock.removeMembershipsMass.mockResolvedValueOnce(
                    Ok({ status: [], value: undefined }),
                );
                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor.mockResolvedValueOnce([
                    [person],
                    undefined,
                ]);
                itslearningPersonAdapterMock.deletePersons.mockResolvedValueOnce(Ok({ status: [], value: undefined }));

                const event: RolleUpdatedEvent = createEvent([], [spA.id]);

                await sut.rolleUpdatedEventHandler(event, () => {});

                expect(personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor).toHaveBeenCalledWith(
                    event.id,
                    expect.any(Number),
                    undefined,
                );
                expect(itslearningPersonAdapterMock.deletePersons).toHaveBeenCalledWith([person.id], event.eventID);
                expect(personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor).toHaveBeenCalledWith(
                    event.id,
                    expect.any(Number),
                    undefined,
                );
                expect(itslearningMembershipAdapterMock.removeMembershipsMass).toHaveBeenCalledWith(
                    [`membership-${personenkontext.personId}-${personenkontext.organisationId}`],
                    event.eventID,
                );
            });

            it('should log specific errors', async () => {
                const spA: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                });
                serviceProviderRepoMock.findByIds.mockResolvedValueOnce(new Map([[spA.id, spA]]));
                const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
                personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor.mockResolvedValueOnce([
                    [personenkontext],
                    undefined,
                ]);
                itslearningMembershipAdapterMock.removeMembershipsMass.mockResolvedValueOnce(
                    Ok({
                        status: [createStatusFailure('Input Error')],
                        value: undefined,
                    }),
                );
                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor.mockResolvedValueOnce([
                    [person],
                    undefined,
                ]);
                itslearningPersonAdapterMock.deletePersons.mockResolvedValueOnce(
                    Ok({
                        status: [createStatusFailure('Input Error')],
                        value: undefined,
                    }),
                );

                const event: RolleUpdatedEvent = createEvent([], [spA.id]);

                await sut.rolleUpdatedEventHandler(event, () => {});

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Could not remove Rolle from person ${personenkontext.personId} at orga ${personenkontext.organisationId}, failed with the following reason: Input Error`,
                );
                expect(loggerMock.error).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Deletion of person ${person.username} failed with the following reason: Input Error`,
                );
            });

            it('should log unexpected errors', async () => {
                const spA: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    externalSystem: ServiceProviderSystem.ITSLEARNING,
                });
                serviceProviderRepoMock.findByIds.mockResolvedValueOnce(new Map([[spA.id, spA]]));
                const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
                personenkontextRepoMock.findWithRolleAtItslearningOrgaByCursor.mockResolvedValueOnce([
                    [personenkontext],
                    undefined,
                ]);
                itslearningMembershipAdapterMock.removeMembershipsMass.mockResolvedValueOnce(
                    Err(new ItsLearningError('Unknown Error')),
                );
                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findWithRolleAndNoOtherItslearningKontexteByCursor.mockResolvedValueOnce([
                    [person],
                    undefined,
                ]);
                itslearningPersonAdapterMock.deletePersons.mockResolvedValueOnce(
                    Err(new ItsLearningError('Unknown Error')),
                );

                const event: RolleUpdatedEvent = createEvent([], [spA.id]);

                await sut.rolleUpdatedEventHandler(event, () => {});

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Could not remove Rolle from person ${personenkontext.personId} at orga ${personenkontext.organisationId}, failed with the following reason: Unknown Error`,
                );
                expect(loggerMock.error).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Deletion of person ${person.username} failed with the following reason: Unknown Error`,
                );
            });
        });

        describe('when not enabled', () => {
            it('should log info and return', async () => {
                sut.ENABLED = false;
                const event: RolleUpdatedEvent = createEvent([], []);

                await sut.rolleUpdatedEventHandler(event, () => {});

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Not enabled, ignoring event.`,
                );
            });
        });
    });
});
