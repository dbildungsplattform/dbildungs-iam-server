import { faker } from '@faker-js/faker';
import { type INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DatabaseTestModule, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS, DoFactory } from '../../../../test/utils/index.js';
import { EventModule } from '../../../core/eventbus/index.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { EntityCouldNotBeCreated } from '../../../shared/error/entity-could-not-be-created.error.js';
import { EntityCouldNotBeUpdated } from '../../../shared/error/entity-could-not-be-updated.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { LdapPersonEntryRenamedEvent } from '../../../shared/events/ldap/ldap-person-entry-renamed.event.js';
import { DisabledOxUserChangedEvent } from '../../../shared/events/ox/disabled-ox-user-changed.event.js';
import { OxSyncUserCreatedEvent } from '../../../shared/events/ox/ox-sync-user-created.event.js';
import { OxUserChangedEvent } from '../../../shared/events/ox/ox-user-changed.event.js';
import { PersonDeletedEvent } from '../../../shared/events/person-deleted.event.js';
import {
    type PersonenkontextEventKontextData,
    type PersonenkontextEventPersonData,
} from '../../../shared/events/personenkontext-event.types.js';
import { PersonenkontextUpdatedEvent } from '../../../shared/events/personenkontext-updated.event.js';
import {
    type PersonenkontextID,
    type PersonID,
    type PersonUsername,
    type RolleID,
} from '../../../shared/types/index.js';
import {
    type OXContextID,
    type OXContextName,
    type OXUserID,
    type OXUserName,
} from '../../../shared/types/ox-ids.types.js';
import { GlobalValidationPipe } from '../../../shared/validation/global-validation.pipe.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { type Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { ServiceProviderKategorie } from '../../service-provider/domain/service-provider.enum.js';
import { type ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { EmailModule } from '../email.module.js';
import { EmailAddressNotFoundError } from '../error/email-address-not-found.error.js';
import { EmailRepo } from '../persistence/email.repo.js';
import { EmailAddress, EmailAddressStatus } from './email-address.js';
import { EmailEventHandler } from './email-event-handler.js';
import { EmailFactory } from './email.factory.js';

function getEmail(address?: string, status?: EmailAddressStatus): EmailAddress<true> {
    const fakePersonId: PersonID = faker.string.uuid();
    const fakeEmailAddressId: string = faker.string.uuid();
    return EmailAddress.construct(
        fakeEmailAddressId,
        faker.date.past(),
        faker.date.recent(),
        fakePersonId,
        address ?? faker.internet.email(),
        status ?? EmailAddressStatus.ENABLED,
    );
}

describe('EmailEventHandler', () => {
    let app: INestApplication;

    let emailEventHandler: EmailEventHandler;
    let emailFactoryMock: DeepMocked<EmailFactory>;
    let emailRepoMock: DeepMocked<EmailRepo>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let dbiamPersonenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let serviceProviderRepoMock: DeepMocked<ServiceProviderRepo>;
    let organisationRepositoryMock: DeepMocked<OrganisationRepository>;
    let loggerMock: DeepMocked<ClassLogger>;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let emailResolverService: DeepMocked<EmailResolverService>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                CommonTestModule,
                EmailModule,
                EventModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: false }),
            ],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
            ],
        })
            .overrideProvider(OrganisationRepository)
            .useValue(createMock(OrganisationRepository))
            .overrideProvider(EmailFactory)
            .useValue(createMock(EmailFactory))
            .overrideProvider(EmailRepo)
            .useValue(createMock(EmailRepo))
            .overrideProvider(ServiceProviderRepo)
            .useValue(createMock(ServiceProviderRepo))
            .overrideProvider(RolleRepo)
            .useValue(createMock(RolleRepo))
            .overrideProvider(DBiamPersonenkontextRepo)
            .useValue(createMock(DBiamPersonenkontextRepo))
            .overrideProvider(PersonRepository)
            .useValue(createMock(PersonRepository))
            .overrideProvider(DBiamPersonenkontextRepo)
            .useValue(createMock(DBiamPersonenkontextRepo))
            .overrideProvider(EmailEventHandler)
            .useClass(EmailEventHandler)
            .overrideProvider(EventRoutingLegacyKafkaService)
            .useClass(EventRoutingLegacyKafkaService)
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .overrideProvider(EmailResolverService)
            .useValue(createMock(EmailResolverService))
            // .useValue(createViMock(EmailResolverService))
            // .useValue(vi.mockObject<EmailResolverService>(Object.create(EmailResolverService.prototype)))
            .compile();

        emailEventHandler = module.get(EmailEventHandler);
        emailFactoryMock = module.get(EmailFactory);
        dbiamPersonenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        emailRepoMock = module.get(EmailRepo);
        rolleRepoMock = module.get(RolleRepo);
        serviceProviderRepoMock = module.get(ServiceProviderRepo);
        dbiamPersonenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        organisationRepositoryMock = module.get(OrganisationRepository);
        loggerMock = module.get(ClassLogger);
        personRepositoryMock = module.get(PersonRepository);
        emailResolverService = module.get(EmailResolverService);

        emailResolverService.shouldUseEmailMicroservice.mockReturnValue(false);

        app = module.createNestApplication();
        await app.init();
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        emailEventHandler.OX_ENABLED = true;
    });

    function mockEmailFactoryCreateNewReturnsEnabledEmail(fakeEmailAddress: string): void {
        // eslint-disable-next-line @typescript-eslint/require-await
        emailFactoryMock.createNew.mockImplementationOnce(async (personId: PersonID) => {
            const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                personId,
                fakeEmailAddress,
                EmailAddressStatus.ENABLED,
            );

            return {
                ok: true,
                value: emailAddress,
            };
        });
    }

    /**
     * Mock dbiamPersonenkontextRepoMock.findByPerson, rolleRepoMock.findByIds and serviceProviderRepoMock.findByIds
     * @param personenkontexte
     * @param rolleMap
     * @param spMap
     */
    function mockRepositoryFindMethods(
        personenkontexte: Personenkontext<true>[],
        rolleMap: Map<string, Rolle<true>>,
        spMap: Map<string, ServiceProvider<true>>,
    ): void {
        dbiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce(personenkontexte);
        rolleRepoMock.findByIds.mockResolvedValueOnce(rolleMap);
        serviceProviderRepoMock.findByIds.mockResolvedValueOnce(spMap);
    }

    describe('test private methods: createOrEnableEmail, createNewEmail, changeEmail, createNewDisabledEmail, getPersonUsernameOrError', () => {
        let fakePersonId: PersonID;
        let fakeUsername: PersonUsername;
        let fakeOldUsername: PersonUsername;
        let fakeRolleId: RolleID;
        let fakeOrgaId: string;
        let fakeEmailAddress: string;
        let fakeNewEmailAddress: string;
        let event: PersonenkontextUpdatedEvent;
        let personRenamedEvent: LdapPersonEntryRenamedEvent;
        let personenkontext: Personenkontext<true>;
        let personenkontexte: Personenkontext<true>[];
        let rolle: Rolle<true>;
        let rolleMap: Map<string, Rolle<true>>;
        let sp: ServiceProvider<true>;
        let spMap: Map<string, ServiceProvider<true>>;
        let emailAddress: EmailAddress<true>;

        beforeEach(() => {
            vi.resetAllMocks();
            fakePersonId = faker.string.uuid();
            fakeUsername = faker.internet.username();
            fakeOldUsername = faker.internet.username();
            fakeRolleId = faker.string.uuid();
            fakeOrgaId = faker.string.uuid();
            fakeEmailAddress = faker.internet.email();
            fakeNewEmailAddress = faker.internet.email();
            event = createMock<PersonenkontextUpdatedEvent>(PersonenkontextUpdatedEvent, {
                person: { id: fakePersonId } as PersonenkontextEventPersonData,
                removedKontexte: [],
                newKontexte: [],
            });
            personRenamedEvent = new LdapPersonEntryRenamedEvent(
                fakePersonId,
                faker.person.firstName(),
                faker.person.lastName(),
                fakeUsername,
                faker.person.firstName(),
                faker.person.lastName(),
                fakeOldUsername,
            );
            personenkontext = { rolleId: fakeRolleId, organisationId: fakeOrgaId } as Personenkontext<true>;
            personenkontexte = [personenkontext];
            rolle = { id: fakeRolleId, serviceProviderIds: [] } as unknown as Rolle<true>;
            rolleMap = new Map<string, Rolle<true>>();
            rolleMap.set(fakeRolleId, rolle);
            sp = {
                kategorie: ServiceProviderKategorie.EMAIL,
            } as ServiceProvider<true>;
            spMap = new Map<string, ServiceProvider<true>>();
            spMap.set(sp.id, sp);
            emailAddress = EmailAddress.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                fakePersonId,
                fakeEmailAddress,
                EmailAddressStatus.ENABLED,
            );

            const emailResolverServiceMock: DeepMocked<EmailResolverService> = createMock(EmailResolverService);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(false);
            emailResolverServiceMock.shouldUseEmailMicroservice();

            emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(false);
        });

        describe('createOrEnableEmail', () => {
            describe('when orgaKennung CANNOT be found', () => {
                it('should log matching error', async () => {
                    mockRepositoryFindMethods(personenkontexte, rolleMap, spMap);
                    emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]); //no existing email is found

                    const persistenceResult: EmailAddress<true> = getEmail();
                    emailRepoMock.save.mockResolvedValueOnce(persistenceResult); //mock: error during saving the entity

                    mockEmailFactoryCreateNewReturnsEnabledEmail(faker.internet.email());

                    // eslint-disable-next-line @typescript-eslint/require-await
                    emailFactoryMock.createNew.mockImplementationOnce(async (personId: PersonID) => {
                        const returnEmailAddress: EmailAddress<false> = EmailAddress.createNew(
                            personId,
                            faker.internet.email(),
                            EmailAddressStatus.ENABLED,
                        );

                        return {
                            ok: true,
                            value: returnEmailAddress,
                        };
                    });
                    organisationRepositoryMock.findById.mockResolvedValue(undefined);

                    await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                    expect(loggerMock.error).toHaveBeenCalledWith(
                        `Could not retrieve orgaKennung, orgaId:${fakeOrgaId}`,
                    );
                });
            });
        });

        describe('createNewEmail', () => {
            describe('when orgaKennung CANNOT be found', () => {
                it('should log matching error', async () => {
                    mockRepositoryFindMethods(personenkontexte, rolleMap, spMap);
                    emailRepoMock.findEnabledByPerson.mockResolvedValueOnce(undefined); //no existing email is found

                    organisationRepositoryMock.findById.mockResolvedValue(undefined);

                    await emailEventHandler.handleLdapPersonEntryRenamedEvent(personRenamedEvent);

                    expect(loggerMock.error).toHaveBeenCalledWith(
                        `Could not retrieve orgaKennung, orgaId:${fakeOrgaId}`,
                    );
                });
            });
        });

        describe('changeEmail', () => {
            describe('when orgaKennung CANNOT be found', () => {
                it('should log error', async () => {
                    mockRepositoryFindMethods(personenkontexte, rolleMap, spMap);
                    emailRepoMock.findEnabledByPerson.mockResolvedValueOnce(emailAddress);

                    emailRepoMock.save.mockResolvedValueOnce(emailAddress);

                    //mock createNewEmail
                    emailFactoryMock.createNew.mockResolvedValueOnce({
                        ok: false,
                        error: new EntityCouldNotBeCreated('EmailAddress'),
                    });

                    //mock persisting new email
                    emailRepoMock.save.mockResolvedValueOnce(emailAddress);

                    organisationRepositoryMock.findById.mockResolvedValue(undefined);

                    await emailEventHandler.handleLdapPersonEntryRenamedEvent(personRenamedEvent);

                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `Received LdapPersonEntryRenamedEvent, personId:${personRenamedEvent.personId}, username:${fakeUsername}, oldUsername:${fakeOldUsername}`,
                    );
                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `DISABLED and saved address:${emailAddress.address}, personId:${personRenamedEvent.personId}, username:${fakeUsername}`,
                    );
                    expect(loggerMock.error).toHaveBeenLastCalledWith(
                        `Could not retrieve orgaKennung, orgaId:${fakeOrgaId}`,
                    );
                });
            });
        });

        describe('getPersonUsernameOrError', () => {
            describe('when personUsername is NOT defined', () => {
                it('should log matching error', async () => {
                    mockRepositoryFindMethods(personenkontexte, rolleMap, spMap);
                    emailRepoMock.findEnabledByPerson.mockResolvedValueOnce(undefined); //no existing email is found
                    organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation<true>(true));
                    //mock person without username is found
                    personRepositoryMock.findById.mockResolvedValueOnce(
                        DoFactory.createPerson<true>(true, { id: fakePersonId, username: undefined }),
                    );
                    await emailEventHandler.handleLdapPersonEntryRenamedEvent(personRenamedEvent);

                    expect(loggerMock.error).toHaveBeenCalledWith(
                        `Username Could Not Be Found For personId:${fakePersonId}`,
                    );
                });
            });
        });

        describe('createNewDisabledEmail', () => {
            describe('when getting personUsername fails', () => {
                it('should NOT call emailFactory and log error accordingly', async () => {
                    mockRepositoryFindMethods([personenkontext], rolleMap, new Map<string, ServiceProvider<true>>());
                    emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([emailAddress]); //mock: deactivated email-address found

                    //mock person with username is NOT found in getPersonUsernameOrError
                    personRepositoryMock.findById.mockResolvedValueOnce(undefined);

                    await emailEventHandler.handleLdapPersonEntryRenamedEvent(personRenamedEvent);

                    expect(emailRepoMock.findByPersonSortedByUpdatedAtDesc).toHaveBeenCalledTimes(1);
                    expect(emailFactoryMock.createNewFromPersonIdAndDomain).toHaveBeenCalledTimes(0);
                    expect(emailRepoMock.save).toHaveBeenCalledTimes(0);
                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `Received LdapPersonEntryRenamedEvent, personId:${personRenamedEvent.personId}, username:${personRenamedEvent.username}, oldUsername:${fakeOldUsername}`,
                    );
                    expect(loggerMock.error).toHaveBeenLastCalledWith(
                        `Person Could Not Be Found For personId:${fakePersonId}`,
                    );
                });
            });

            describe('when email generation in factory fails', () => {
                it('should NOT persist email and log error accordingly', async () => {
                    mockRepositoryFindMethods([personenkontext], rolleMap, new Map<string, ServiceProvider<true>>());
                    emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([emailAddress]); //mock: deactivated email-address found

                    //mock person with username is found in getPersonUsernameOrError
                    personRepositoryMock.findById.mockResolvedValueOnce(
                        DoFactory.createPerson<true>(true, { id: fakePersonId, username: fakeUsername }),
                    );

                    const fakeErrorMessage: string = 'Lise Meitner kann nichts dafuer';
                    const factoryResult: Result<EmailAddress<false>> = {
                        ok: false,
                        error: { name: 'Error', message: fakeErrorMessage },
                    };

                    //mock failure in factory
                    emailFactoryMock.createNewFromPersonIdAndDomain.mockResolvedValueOnce(factoryResult);

                    //mock all calls to save since FAILED email-addresses are also persisted -> multiple calls to save
                    emailRepoMock.save.mockResolvedValue(createMock(EmailAddress<true>));

                    await emailEventHandler.handleLdapPersonEntryRenamedEvent(personRenamedEvent);

                    expect(emailRepoMock.findByPersonSortedByUpdatedAtDesc).toHaveBeenCalledTimes(1);
                    expect(emailFactoryMock.createNewFromPersonIdAndDomain).toHaveBeenCalledTimes(1);
                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `Received LdapPersonEntryRenamedEvent, personId:${personRenamedEvent.personId}, username:${personRenamedEvent.username}, oldUsername:${fakeOldUsername}`,
                    );
                    expect(loggerMock.error).toHaveBeenLastCalledWith(
                        `Could not create new and DISABLED email for personId:${fakePersonId}, username:${fakeUsername}, error:${fakeErrorMessage}`,
                    );
                });
            });

            describe('when persisting disabled email fails', () => {
                it('should NOT publish DisabledEmailAddressGeneratedEvent and log error accordingly', async () => {
                    mockRepositoryFindMethods([personenkontext], rolleMap, new Map<string, ServiceProvider<true>>());
                    emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([emailAddress]); //mock: deactivated email-address found

                    //mock person with username is found in getPersonUsernameOrError
                    personRepositoryMock.findById.mockResolvedValueOnce(
                        DoFactory.createPerson<true>(true, { id: fakePersonId, username: fakeUsername }),
                    );

                    const factoryResult: Result<EmailAddress<false>> = {
                        ok: true,
                        value: DoFactory.createEmailAddress<false>(false, fakeNewEmailAddress),
                    };

                    //mock creation in factory succeeds
                    emailFactoryMock.createNewFromPersonIdAndDomain.mockResolvedValueOnce(factoryResult);
                    //mock persisting email fails
                    emailRepoMock.save.mockResolvedValue(new EntityCouldNotBeCreated('EmailAddress'));

                    await emailEventHandler.handleLdapPersonEntryRenamedEvent(personRenamedEvent);

                    expect(emailRepoMock.findByPersonSortedByUpdatedAtDesc).toHaveBeenCalledTimes(1);
                    expect(emailFactoryMock.createNewFromPersonIdAndDomain).toHaveBeenCalledTimes(1);
                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `Received LdapPersonEntryRenamedEvent, personId:${personRenamedEvent.personId}, username:${personRenamedEvent.username}, oldUsername:${fakeOldUsername}`,
                    );
                    expect(loggerMock.error).toHaveBeenLastCalledWith(
                        `Could not persist email for personId:${fakePersonId}, username:${fakeUsername}, error:EmailAddress could not be created`,
                    );
                });
            });
        });
    });

    describe('handleOxSyncUserCreatedEvent and handleOxUserChangedEvent', () => {
        let fakePersonId: string;
        let fakeKeycloakUsername: string;
        let fakeOXUserId: OXUserID;
        let fakeOXUserName: OXUserName;
        let fakeContextId: OXContextID;
        let fakeOXContextName: OXContextName;
        let fakeEmail: string;
        let event: OxSyncUserCreatedEvent;

        beforeEach(() => {
            fakePersonId = faker.string.uuid();
            fakeKeycloakUsername = faker.internet.username();
            fakeOXUserId = faker.string.numeric();
            fakeContextId = faker.string.numeric();
            fakeOXUserName = fakeKeycloakUsername;
            fakeOXContextName = 'context1';
            fakeEmail = faker.internet.email();
            event = new OxSyncUserCreatedEvent(
                fakePersonId,
                fakeKeycloakUsername,
                fakeOXUserId,
                fakeOXUserName,
                fakeContextId,
                fakeOXContextName,
                fakeEmail,
            );
        });

        describe('handleOxSyncUserCreatedEvent', () => {
            beforeEach(() => {
                event = new OxSyncUserCreatedEvent(
                    fakePersonId,
                    fakeKeycloakUsername,
                    fakeOXUserId,
                    fakeOXUserName,
                    fakeContextId,
                    fakeOXContextName,
                    fakeEmail,
                );
            });

            describe('when email cannot be found by personId', () => {
                it('should log error', async () => {
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(undefined);

                    await emailEventHandler.handleOxSyncUserCreatedEvent(event);

                    expect(loggerMock.info).toHaveBeenLastCalledWith(
                        `Cannot find REQUESTED email-address for person with personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}, enabling not necessary`,
                    );
                });
            });

            describe('when email-address from OX and requested email-address are not equal', () => {
                it('should log error', async () => {
                    const emailAddress: string = faker.internet.email();
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(
                        DoFactory.createEmailAddress<true>(true, emailAddress),
                    );

                    emailRepoMock.save.mockResolvedValueOnce(DoFactory.createEmailAddress<true>(true));

                    await emailEventHandler.handleOxSyncUserCreatedEvent(event);

                    expect(loggerMock.warning).toHaveBeenCalledWith(
                        `Mismatch between REQUESTED(${emailAddress}) and received(${event.primaryEmail}) address from OX, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}`,
                    );
                    expect(loggerMock.warning).toHaveBeenLastCalledWith(
                        `Overriding ${emailAddress} with ${event.primaryEmail}) from OX, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}`,
                    );
                });
            });

            describe('when persisting changes to email-address fails', () => {
                it('should log error', async () => {
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(
                        DoFactory.createEmailAddress<true>(true, fakeEmail),
                    );

                    emailRepoMock.save.mockResolvedValueOnce(new EntityCouldNotBeUpdated('EmailAddress', '1'));

                    await emailEventHandler.handleOxSyncUserCreatedEvent(event);

                    expect(loggerMock.error).toHaveBeenLastCalledWith(
                        `Could not ENABLE email for personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}, error:EmailAddress with ID 1 could not be updated`,
                    );
                });
            });

            describe('when changing email status is successful', () => {
                it('should log info', async () => {
                    const emailMock: EmailAddress<true> = DoFactory.createEmailAddress<true>(true, fakeEmail);
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(emailMock);

                    emailRepoMock.save.mockResolvedValueOnce(emailMock);

                    await emailEventHandler.handleOxSyncUserCreatedEvent(event);

                    expect(loggerMock.info).toHaveBeenLastCalledWith(
                        `Changed email-address:${fakeEmail} from REQUESTED to ENABLED, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}`,
                    );
                });
            });
        });

        describe('handleOxUserChangedEvent', () => {
            beforeEach(() => {
                event = new OxUserChangedEvent(
                    fakePersonId,
                    fakeKeycloakUsername,
                    fakeOXUserId,
                    fakeOXUserName,
                    fakeContextId,
                    fakeOXContextName,
                    fakeEmail,
                );
            });

            describe('when email cannot be found by personId', () => {
                it('should log error', async () => {
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(undefined);

                    await emailEventHandler.handleOxUserChangedEvent(event);

                    expect(loggerMock.info).toHaveBeenLastCalledWith(
                        `Cannot find REQUESTED email-address for person with personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}, enabling not necessary`,
                    );
                });
            });

            describe('when email-address from OX and requested email-address are not equal', () => {
                it('should log error', async () => {
                    const emailAddress: string = faker.internet.email();
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(
                        DoFactory.createEmailAddress<true>(true, emailAddress),
                    );

                    emailRepoMock.save.mockResolvedValueOnce(DoFactory.createEmailAddress<true>(true));

                    await emailEventHandler.handleOxUserChangedEvent(event);

                    expect(loggerMock.warning).toHaveBeenCalledWith(
                        `Mismatch between REQUESTED(${emailAddress}) and received(${event.primaryEmail}) address from OX, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}`,
                    );
                    expect(loggerMock.warning).toHaveBeenLastCalledWith(
                        `Overriding ${emailAddress} with ${event.primaryEmail}) from OX, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}`,
                    );
                });
            });

            describe('when persisting changes to email-address fails', () => {
                it('should log error', async () => {
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(
                        DoFactory.createEmailAddress<true>(true, fakeEmail),
                    );

                    emailRepoMock.save.mockResolvedValueOnce(new EntityCouldNotBeUpdated('EmailAddress', '1'));

                    await emailEventHandler.handleOxUserChangedEvent(event);

                    expect(loggerMock.error).toHaveBeenLastCalledWith(
                        `Could not ENABLE email for personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}, error:EmailAddress with ID 1 could not be updated`,
                    );
                });
            });

            describe('when changing email status is successful', () => {
                it('should log info', async () => {
                    const emailMock: EmailAddress<true> = DoFactory.createEmailAddress<true>(true, fakeEmail);
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(emailMock);

                    emailRepoMock.save.mockResolvedValueOnce(emailMock);

                    await emailEventHandler.handleOxUserChangedEvent(event);

                    expect(loggerMock.info).toHaveBeenLastCalledWith(
                        `Changed email-address:${fakeEmail} from REQUESTED to ENABLED, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}`,
                    );
                });
            });
        });
    });

    describe('handlePersonenkontextUpdatedEvent', () => {
        let fakePersonId: PersonID;
        let fakeUsername: PersonUsername;
        let fakeRolleId: RolleID;
        let fakePKId: PersonenkontextID;
        let fakeEmailAddressString: string;
        let event: PersonenkontextUpdatedEvent;
        let personenkontexte: Personenkontext<true>[];
        let rolle: Rolle<true>;
        let rolleMap: Map<string, Rolle<true>>;
        let sp: ServiceProvider<true>;
        let spMap: Map<string, ServiceProvider<true>>;

        beforeEach(() => {
            vi.resetAllMocks();
            fakePersonId = faker.string.uuid();
            fakeUsername = faker.internet.username();
            fakeRolleId = faker.string.uuid();
            fakePKId = faker.string.uuid();
            fakeEmailAddressString = faker.internet.email();

            event = createMock<PersonenkontextUpdatedEvent>(PersonenkontextUpdatedEvent, {
                person: {
                    id: fakePersonId,
                    username: fakeUsername,
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                },
                removedKontexte: [],
                newKontexte: [],
            });
            personenkontexte = [DoFactory.createPersonenkontext<true>(true, { rolleId: fakeRolleId })];
            rolle = DoFactory.createRolle<true>(true, { id: fakeRolleId, serviceProviderIds: [] });
            rolleMap = new Map<string, Rolle<true>>();
            rolleMap.set(fakeRolleId, rolle);
            sp = DoFactory.createServiceProvider<true>(true, {
                kategorie: ServiceProviderKategorie.EMAIL,
            });
            spMap = new Map<string, ServiceProvider<true>>();
            spMap.set(sp.id, sp);

            organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation<true>(true));
        });

        describe('when email microservice is enabled', () => {
            it('should not call handlePerson when microservice is disabled', async () => {
                const mockEvent: PersonenkontextUpdatedEvent = createMock<PersonenkontextUpdatedEvent>(
                    PersonenkontextUpdatedEvent,
                    {
                        person: {
                            id: faker.string.uuid(),
                            vorname: faker.person.firstName(),
                            familienname: faker.person.lastName(),
                            username: faker.internet.username(),
                        },
                        newKontexte: [],
                        removedKontexte: [],
                        currentKontexte: [],
                    },
                );
                mockEvent.newKontexte.push({} as PersonenkontextEventKontextData);
                mockEvent.newKontexte.push({} as PersonenkontextEventKontextData);
                mockEvent.removedKontexte.push({} as PersonenkontextEventKontextData);
                mockEvent.currentKontexte.push({} as PersonenkontextEventKontextData);
                emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(true);

                await emailEventHandler.handlePersonenkontextUpdatedEvent(mockEvent);
                expect(loggerMock.info).toHaveBeenCalledWith(
                    expect.stringContaining('Received PersonenkontextUpdatedEvent'),
                );
                expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Ignoring Event for'));
                expect(emailResolverService.setEmailForSpshPerson).not.toHaveBeenCalled();
            });
        });

        describe('when email exists, person with username can be found and is enabled', () => {
            it('should log matching info', async () => {
                mockRepositoryFindMethods(personenkontexte, rolleMap, spMap);

                // eslint-disable-next-line @typescript-eslint/require-await
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockImplementationOnce(async (personId: PersonID) => [
                    new EmailAddress<true>(
                        faker.string.uuid(),
                        faker.date.past(),
                        faker.date.recent(),
                        personId,
                        faker.internet.email(),
                        EmailAddressStatus.ENABLED,
                    ),
                ]);

                //mock person with username is found
                personRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createPerson<true>(true, { username: fakeUsername }),
                );

                await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Existing email for personId:${fakePersonId}, username:${fakeUsername} already ENABLED`,
                );
            });
        });

        //test case to cover case: getPersonUsernameOrError is returning error
        describe('when email exists, person WITHOUT username is found and is enabled', () => {
            it('should log matching info', async () => {
                mockRepositoryFindMethods(personenkontexte, rolleMap, spMap);

                // eslint-disable-next-line @typescript-eslint/require-await
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockImplementationOnce(async (personId: PersonID) => [
                    new EmailAddress<true>(
                        faker.string.uuid(),
                        faker.date.past(),
                        faker.date.recent(),
                        personId,
                        faker.internet.email(),
                        EmailAddressStatus.ENABLED,
                    ),
                ]);

                //mock person with username is found
                personRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createPerson<true>(true, { username: undefined }),
                );

                await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Username Could Not Be Found For personId:${fakePersonId}`,
                );
                expect(loggerMock.info).not.toHaveBeenCalledWith(
                    `Existing email for personId:${fakePersonId} already enabled`,
                );
            });
        });

        describe('when email exists but is disabled and enabling is successful', () => {
            it('should log matching info', async () => {
                mockRepositoryFindMethods(personenkontexte, rolleMap, spMap);

                //mock person with username is found
                personRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createPerson<true>(true, { id: faker.string.uuid(), username: fakeUsername }),
                );

                // eslint-disable-next-line @typescript-eslint/require-await
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockImplementationOnce(async (personId: PersonID) => [
                    new EmailAddress<true>(
                        faker.string.uuid(),
                        faker.date.past(),
                        faker.date.recent(),
                        personId,
                        faker.internet.email(),
                        EmailAddressStatus.DISABLED,
                    ),
                ]);

                const persistedEmail: EmailAddress<true> = getEmail();
                emailRepoMock.save.mockResolvedValueOnce(persistedEmail);

                await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Enabled PRIMARY email address:${persistedEmail.address}, personId:${fakePersonId}, username:${fakeUsername}`,
                );
            });
        });

        describe('with Rolle referencing SP, but no matching Personenkontext', () => {
            it('should log error that no matching Personenkontext was found', async () => {
                const pks: Personenkontext<true>[] = [DoFactory.createPersonenkontext<true>(true)];
                mockRepositoryFindMethods(pks, rolleMap, spMap);

                personRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createPerson<true>(true, { username: fakeUsername }),
                );

                // eslint-disable-next-line @typescript-eslint/require-await
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockImplementationOnce(async (personId: PersonID) => [
                    new EmailAddress<true>(
                        faker.string.uuid(),
                        faker.date.past(),
                        faker.date.recent(),
                        personId,
                        faker.internet.email(),
                        EmailAddressStatus.DISABLED,
                    ),
                ]);

                const persistedEmail: EmailAddress<true> = getEmail();
                emailRepoMock.save.mockResolvedValueOnce(persistedEmail);

                await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Rolle with id:${fakeRolleId} references SP, but no matching Personenkontext was found`,
                );
            });
        });

        describe('when email exists and but is disabled but enabling fails', () => {
            it('should log matching error', async () => {
                mockRepositoryFindMethods(personenkontexte, rolleMap, spMap);

                //mock person with username is found
                personRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createPerson<true>(true, { id: faker.string.uuid(), username: fakeUsername }),
                );

                // eslint-disable-next-line @typescript-eslint/require-await
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockImplementationOnce(async (personId: PersonID) => [
                    new EmailAddress<true>(
                        faker.string.uuid(),
                        faker.date.past(),
                        faker.date.recent(),
                        personId,
                        faker.internet.email(),
                        EmailAddressStatus.DISABLED,
                    ),
                ]);

                emailRepoMock.save.mockResolvedValueOnce(new EmailAddressNotFoundError(fakeEmailAddressString));

                await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Could not ENABLE email for personId:${fakePersonId}, username:${fakeUsername}, error:requested EmailAddress with the address:${fakeEmailAddressString} was not found`,
                );
            });
        });

        describe('when email does NOT exist should create and persist a new one', () => {
            it('should log matching info', async () => {
                mockRepositoryFindMethods(personenkontexte, rolleMap, spMap);
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]); //no existing email is found
                //mock person with username is found
                personRepositoryMock.findById.mockResolvedValue(
                    DoFactory.createPerson<true>(true, { id: faker.string.uuid(), username: fakeUsername }),
                );

                const persistenceResult: EmailAddress<true> = getEmail();
                emailRepoMock.save.mockResolvedValueOnce(persistenceResult); //mock: error during saving the entity

                mockEmailFactoryCreateNewReturnsEnabledEmail(faker.internet.email());

                // eslint-disable-next-line @typescript-eslint/require-await
                emailFactoryMock.createNew.mockImplementationOnce(async (personId: PersonID) => {
                    const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                        personId,
                        faker.internet.email(),
                        EmailAddressStatus.ENABLED,
                    );

                    return {
                        ok: true,
                        value: emailAddress,
                    };
                });

                await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Successfully persisted email with REQUEST status for address:${persistenceResult.currentAddress}, personId:${fakePersonId}, username:${fakeUsername}`,
                );
            });
        });

        describe('when email does NOT exist and error occurs during creation', () => {
            it('should log matching info', async () => {
                mockRepositoryFindMethods(personenkontexte, rolleMap, spMap);
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]); //no existing email is found
                //mock person with username is found
                personRepositoryMock.findById.mockResolvedValue(
                    DoFactory.createPerson<true>(true, { id: faker.string.uuid(), username: fakeUsername }),
                );

                // eslint-disable-next-line @typescript-eslint/require-await
                emailFactoryMock.createNew.mockImplementationOnce(async (personId: PersonID) => {
                    return {
                        ok: false,
                        error: new EntityNotFoundError('Person', personId),
                    };
                });

                //mock persisting failed EmailAddress is successful
                emailRepoMock.save.mockResolvedValueOnce(
                    new EmailAddress<true>(
                        faker.string.uuid(),
                        faker.date.past(),
                        faker.date.recent(),
                        faker.string.uuid(),
                        faker.internet.email(),
                        EmailAddressStatus.ENABLED,
                    ),
                );

                await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Could not create new email for personId:${fakePersonId}, username:${fakeUsername}, error:requested Person with the following ID ${fakePersonId} was not found`,
                );
            });
        });

        //createAndPersistFailedEmailAddress is private, tested via handlePersonenkontextUpdatedEvent
        describe('createAndPersistFailedEmailAddress', () => {
            describe('when persisting EmailAddress with Failed status fails', () => {
                it('should log matching info', async () => {
                    //mock getting username (used for logging)
                    personRepositoryMock.findById.mockResolvedValueOnce(
                        DoFactory.createPerson<true>(true, { username: fakeUsername }),
                    );
                    mockRepositoryFindMethods(personenkontexte, rolleMap, spMap);

                    emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]); //no existing email is found
                    //mock person with username is found
                    personRepositoryMock.findById.mockResolvedValue(
                        DoFactory.createPerson<true>(true, { id: faker.string.uuid(), username: fakeUsername }),
                    );

                    // eslint-disable-next-line @typescript-eslint/require-await
                    emailFactoryMock.createNew.mockImplementationOnce(async (personId: PersonID) => {
                        return {
                            ok: false,
                            error: new EntityNotFoundError('Person', personId),
                        };
                    });

                    //mock persisting failed EmailAddress has failed
                    emailRepoMock.save.mockResolvedValueOnce(new EntityCouldNotBeUpdated('EmailAddress', '1'));

                    await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                    expect(loggerMock.error).toHaveBeenCalledWith(
                        `Could not create new email for personId:${fakePersonId}, username:${fakeUsername}, error:requested Person with the following ID ${fakePersonId} was not found`,
                    );
                });
            });
        });

        describe('when email does NOT exist and error occurs during persisting', () => {
            it('should log matching info', async () => {
                //mock getting username (used for logging)
                personRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createPerson<true>(true, { username: fakeUsername }),
                );
                mockRepositoryFindMethods(personenkontexte, rolleMap, spMap);
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]); //no existing email is found
                //mock person with username is found
                personRepositoryMock.findById.mockResolvedValue(
                    DoFactory.createPerson<true>(true, { id: faker.string.uuid(), username: fakeUsername }),
                );

                emailRepoMock.save.mockResolvedValueOnce(new EmailAddressNotFoundError(fakeEmailAddressString)); //mock: error during saving the entity

                // eslint-disable-next-line @typescript-eslint/require-await
                emailFactoryMock.createNew.mockImplementationOnce(async (personId: PersonID) => {
                    const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                        personId,
                        faker.internet.email(),
                        EmailAddressStatus.ENABLED,
                    );

                    return {
                        ok: true,
                        value: emailAddress,
                    };
                });

                await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Could not persist email for personId:${fakePersonId}, username:${fakeUsername}, error:requested EmailAddress with the address:${fakeEmailAddressString} was not found`,
                );
            });
            describe('when multiple disabled emails exist, should enable first one as primary and identify latest as alternative', () => {
                describe('when multiple disabled emails exist, should enable first one as primary and identify latest as alternative', () => {
                    it('should enable first disabled email as primary and keep latest disabled email as alternative', async () => {
                        mockRepositoryFindMethods(personenkontexte, rolleMap, spMap);

                        // Mock person with username is found
                        personRepositoryMock.findById.mockResolvedValueOnce(
                            DoFactory.createPerson<true>(true, { id: faker.string.uuid(), username: fakeUsername }),
                        );

                        // Create multiple disabled emails
                        const latestDisabledEmail: EmailAddress<true> = new EmailAddress<true>(
                            'latest-email-id',
                            faker.date.past(),
                            faker.date.recent(),
                            fakePersonId,
                            'latest@example.com',
                            EmailAddressStatus.DISABLED,
                        );

                        const firstDisabledEmail: EmailAddress<true> = new EmailAddress<true>(
                            'first-email-id',
                            faker.date.past(),
                            faker.date.past(),
                            fakePersonId,
                            'first@example.com',
                            EmailAddressStatus.DISABLED,
                        );

                        // Mock finding multiple disabled emails (latest first due to sorting)
                        // eslint-disable-next-line @typescript-eslint/require-await
                        emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockImplementationOnce(async () => [
                            firstDisabledEmail, // This will be found first by .find() and enabled as primary
                            latestDisabledEmail, // This will be found as alternative (stays disabled)
                        ]);

                        // Mock successful save for the first disabled email (which becomes primary)
                        const enabledPrimaryEmail: EmailAddress<true> = new EmailAddress<true>(
                            'first-email-id',
                            faker.date.past(),
                            faker.date.recent(),
                            fakePersonId,
                            'first@example.com',
                            EmailAddressStatus.ENABLED, // Now enabled
                        );

                        emailRepoMock.save.mockResolvedValueOnce(enabledPrimaryEmail);

                        await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                        expect(loggerMock.info).toHaveBeenCalledWith(
                            `Enabled PRIMARY email address:first@example.com, personId:${fakePersonId}, username:${fakeUsername}`,
                        );

                        // Verify save was called only once (only primary email was enabled)
                        expect(emailRepoMock.save).toHaveBeenCalledTimes(1);
                        expect(emailRepoMock.save).toHaveBeenCalledWith(firstDisabledEmail);
                    });
                });
            });
        });

        describe('when lehrer does not have any PK, email is enabled, disable email and error occurs during persisting', () => {
            it('should log matching info', async () => {
                //mock getting username (used for logging)
                personRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createPerson<true>(true, { username: fakeUsername }),
                );
                mockRepositoryFindMethods(personenkontexte, rolleMap, new Map<string, ServiceProvider<true>>());

                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([getEmail()]);
                emailRepoMock.save.mockResolvedValueOnce(new EmailAddressNotFoundError(fakeEmailAddressString)); //mock: error during saving the entity

                await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    expect.stringContaining('Existing email found for personId'),
                );
                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Could not DISABLE email, personId:${fakePersonId}, username:${fakeUsername}, error:requested EmailAddress with the address:${fakeEmailAddressString} was not found`,
                );
            });
        });

        [
            { status: EmailAddressStatus.ENABLED },
            { status: EmailAddressStatus.REQUESTED },
            { status: EmailAddressStatus.FAILED },
        ].forEach(({ status }: { status: EmailAddressStatus }) => {
            describe(`when lehrer does not have any PK, email is ${status}, disable email is successful`, () => {
                it('should log matching info', async () => {
                    //mock getting username (used for logging)
                    personRepositoryMock.findById.mockResolvedValueOnce(
                        DoFactory.createPerson<true>(true, { username: fakeUsername }),
                    );
                    mockRepositoryFindMethods(personenkontexte, rolleMap, new Map<string, ServiceProvider<true>>());

                    personRepositoryMock.findById.mockResolvedValueOnce(
                        DoFactory.createPerson<true>(true, { username: fakeUsername }),
                    );

                    const emailAddress: EmailAddress<true> = EmailAddress.construct(
                        faker.string.uuid(),
                        faker.date.past(),
                        faker.date.recent(),
                        fakePersonId,
                        faker.internet.email(),
                        EmailAddressStatus.DISABLED,
                    );

                    emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([
                        EmailAddress.construct(
                            faker.string.uuid(),
                            faker.date.past(),
                            faker.date.recent(),
                            fakePersonId,
                            faker.internet.email(),
                            status,
                        ),
                    ]);

                    emailRepoMock.save.mockResolvedValueOnce(emailAddress);
                    await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                    expect(loggerMock.info).toHaveBeenCalledWith(
                        expect.stringContaining('Existing email found for personId'),
                    );
                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `DISABLED and saved address:${emailAddress.address}, personId:${fakePersonId}, username:${fakeUsername}`,
                    );
                });
            });
        });

        describe('when lehrer does not have any PK and OX is not enabled', () => {
            it('should not disable any email and should log info about OX being disabled', async () => {
                emailEventHandler.OX_ENABLED = false;
                mockRepositoryFindMethods(personenkontexte, rolleMap, new Map<string, ServiceProvider<true>>());

                // Provide an enabled email to check that it is not disabled
                const enabledEmail: EmailAddress<true> = EmailAddress.construct(
                    faker.string.uuid(),
                    faker.date.past(),
                    faker.date.recent(),
                    fakePersonId,
                    faker.internet.email(),
                    EmailAddressStatus.ENABLED,
                );
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([enabledEmail]);

                await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `OX is not enabled, no email will be disabled for personId:${fakePersonId}, username:${fakeUsername}`,
                );
                expect(emailRepoMock.save).not.toHaveBeenCalled();
            });
        });

        describe(`When email is disabled and Person does not have an username, EmailAddressDisabledEvent is not published`, () => {
            it('should log matching error', async () => {
                mockRepositoryFindMethods(personenkontexte, rolleMap, new Map<string, ServiceProvider<true>>());

                personRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createPerson<true>(true, { username: undefined }),
                );

                const emailAddress: EmailAddress<true> = EmailAddress.construct(
                    faker.string.uuid(),
                    faker.date.past(),
                    faker.date.recent(),
                    fakePersonId,
                    faker.internet.email(),
                    EmailAddressStatus.DISABLED,
                );

                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([
                    EmailAddress.construct(
                        faker.string.uuid(),
                        faker.date.past(),
                        faker.date.recent(),
                        fakePersonId,
                        faker.internet.email(),
                        EmailAddressStatus.ENABLED,
                    ),
                ]);

                emailRepoMock.save.mockResolvedValueOnce(emailAddress);
                await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    expect.stringContaining('Existing email found for personId'),
                );
                expect(loggerMock.info).toHaveBeenCalledWith(
                    `DISABLED and saved address:${emailAddress.address}, personId:${fakePersonId}, username:${fakeUsername}`,
                );
                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Could not publish EmailAddressDisabledEvent, personId:${fakePersonId} has no username`,
                );
            });
        });

        describe(`when removedPersonenkontexte are not undefined`, () => {
            it('should filter PKs of person to exclude the ones which will be removed', async () => {
                event = createMock<PersonenkontextUpdatedEvent>(PersonenkontextUpdatedEvent, {
                    person: {
                        id: fakePersonId,
                        username: fakeUsername,
                        vorname: faker.person.firstName(),
                        familienname: faker.person.lastName(),
                    },
                    removedKontexte: [],
                    newKontexte: [],
                    currentKontexte: [],
                });
                event.removedKontexte.push({
                    id: fakePKId,
                } as PersonenkontextEventKontextData);

                dbiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce(personenkontexte);
                // mock that no rollenIds can be found
                rolleRepoMock.findByIds.mockResolvedValueOnce(new Map<string, Rolle<true>>());
                serviceProviderRepoMock.findByIds.mockResolvedValueOnce(spMap);

                //mock person with username is found
                personRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createPerson<true>(true, {
                        id: faker.string.uuid(),
                        username: faker.internet.username(),
                    }),
                );

                // eslint-disable-next-line @typescript-eslint/require-await
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockImplementationOnce(async (personId: PersonID) => [
                    new EmailAddress<true>(
                        faker.string.uuid(),
                        faker.date.past(),
                        faker.date.recent(),
                        personId,
                        faker.internet.email(),
                        EmailAddressStatus.DISABLED,
                    ),
                ]);

                const persistedEmail: EmailAddress<true> = getEmail();
                emailRepoMock.save.mockResolvedValueOnce(persistedEmail);

                await emailEventHandler.handlePersonenkontextUpdatedEvent(event);

                expect(loggerMock.info).not.toHaveBeenCalledWith(
                    `Person with id:${fakePersonId} needs an email, creating or enabling address`,
                );
            });
        });
    });

    describe('handleLdapPersonEntryRenamedEvent', () => {
        let fakePersonId: PersonID;
        let fakeUsername: PersonUsername;
        let fakeOldUsername: PersonUsername;
        let fakeRolleId: RolleID;
        let fakeEmailAddress: string;
        let fakeNewEmailAddress: string;
        let event: LdapPersonEntryRenamedEvent;
        let personenkontext: Personenkontext<true>;
        let rolle: Rolle<true>;
        let rollenMap: Map<string, Rolle<true>>;
        let sp: ServiceProvider<true>;
        let spMap: Map<string, ServiceProvider<true>>;
        let emailAddress: EmailAddress<true>;

        beforeEach(() => {
            fakePersonId = faker.string.uuid();
            fakeUsername = faker.internet.username();
            fakeOldUsername = faker.internet.username();
            fakeRolleId = faker.string.uuid();
            fakeEmailAddress = faker.internet.email();
            fakeNewEmailAddress = faker.internet.email();
            event = new LdapPersonEntryRenamedEvent(
                fakePersonId,
                faker.person.firstName(),
                faker.person.lastName(),
                fakeUsername,
                faker.person.firstName(),
                faker.person.lastName(),
                fakeOldUsername,
            );
            personenkontext = DoFactory.createPersonenkontext<true>(true, { rolleId: fakeRolleId });
            rolle = DoFactory.createRolle<true>(true, { id: fakeRolleId });
            rollenMap = new Map<string, Rolle<true>>();
            rollenMap.set(fakeRolleId, rolle);
            sp = DoFactory.createServiceProvider<true>(true, {
                kategorie: ServiceProviderKategorie.EMAIL,
            });
            spMap = new Map<string, ServiceProvider<true>>();
            spMap.set(sp.id, sp);
            rolleRepoMock.findById.mockResolvedValueOnce(rolle);
            emailAddress = EmailAddress.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                fakePersonId,
                fakeEmailAddress,
                EmailAddressStatus.ENABLED,
            );

            organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation<true>(true));
        });

        describe('when emailMicroservice is enabled', () => {
            it('should not call handlePerson', async () => {
                emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(true);

                await emailEventHandler.handleLdapPersonEntryRenamedEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    expect.stringContaining('Received LdapPersonEntryRenamedEvent'),
                );
                expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Ignoring Event for'));
                expect(emailResolverService.setEmailForSpshPerson).not.toHaveBeenCalled();
            });
        });

        describe('when rolle exists and service provider with kategorie email is found', () => {
            describe('when enabled email already exists and save disabling is successful', () => {
                it('should log info only', async () => {
                    mockRepositoryFindMethods([personenkontext], rollenMap, spMap);
                    emailRepoMock.findEnabledByPerson.mockResolvedValueOnce(emailAddress);
                    //mock person with username is found
                    personRepositoryMock.findById.mockResolvedValueOnce(
                        DoFactory.createPerson<true>(true, {
                            id: faker.string.uuid(),
                            username: faker.internet.username(),
                        }),
                    );

                    emailRepoMock.save.mockResolvedValueOnce(emailAddress);

                    //mock createNewEmail
                    mockEmailFactoryCreateNewReturnsEnabledEmail(fakeEmailAddress);

                    //mock persisting new email
                    emailRepoMock.save.mockResolvedValueOnce(emailAddress);

                    await emailEventHandler.handleLdapPersonEntryRenamedEvent(event);

                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `Received LdapPersonEntryRenamedEvent, personId:${event.personId}, username:${event.username}, oldUsername:${fakeOldUsername}`,
                    );
                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `DISABLED and saved address:${emailAddress.address}, personId:${event.personId}, username:${event.username}`,
                    );
                });
            });

            describe('when enabled email already exists and creating new (changed) email via factory fails', () => {
                it('should log error', async () => {
                    mockRepositoryFindMethods([personenkontext], rollenMap, spMap);
                    emailRepoMock.findEnabledByPerson.mockResolvedValueOnce(emailAddress);
                    //mock person with username is found
                    personRepositoryMock.findById.mockResolvedValueOnce(
                        DoFactory.createPerson<true>(true, { id: faker.string.uuid(), username: fakeUsername }),
                    );

                    emailRepoMock.save.mockResolvedValueOnce(emailAddress);

                    //mock createNewEmail
                    emailFactoryMock.createNew.mockResolvedValueOnce({
                        ok: false,
                        error: new EntityCouldNotBeCreated('EmailAddress'),
                    });

                    //mock persisting new email
                    emailRepoMock.save.mockResolvedValueOnce(emailAddress);

                    await emailEventHandler.handleLdapPersonEntryRenamedEvent(event);

                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `Received LdapPersonEntryRenamedEvent, personId:${event.personId}, username:${event.username}, oldUsername:${fakeOldUsername}`,
                    );
                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `DISABLED and saved address:${emailAddress.address}, personId:${event.personId}, username:${event.username}`,
                    );
                    expect(loggerMock.error).toHaveBeenLastCalledWith(
                        `Could not create change-email for personId:${event.personId}, username:${fakeUsername}, error:EmailAddress could not be created`,
                    );
                });
            });

            describe('when enabled email already exists and creating new (changed) email via factory succeeds but persisting fails', () => {
                it('should log error', async () => {
                    mockRepositoryFindMethods([personenkontext], rollenMap, spMap);
                    emailRepoMock.findEnabledByPerson.mockResolvedValueOnce(emailAddress);
                    //mock person with username is found
                    personRepositoryMock.findById.mockResolvedValueOnce(
                        DoFactory.createPerson<true>(true, { id: faker.string.uuid(), username: fakeUsername }),
                    );

                    emailRepoMock.save.mockResolvedValueOnce(emailAddress);

                    //mock createNewEmail
                    mockEmailFactoryCreateNewReturnsEnabledEmail(fakeEmailAddress);

                    //mock persisting new email
                    emailRepoMock.save.mockResolvedValueOnce(new EntityCouldNotBeCreated('EmailAddress'));

                    await emailEventHandler.handleLdapPersonEntryRenamedEvent(event);

                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `Received LdapPersonEntryRenamedEvent, personId:${event.personId}, username:${event.username}, oldUsername:${fakeOldUsername}`,
                    );
                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `DISABLED and saved address:${emailAddress.address}, personId:${event.personId}, username:${event.username}`,
                    );
                    expect(loggerMock.error).toHaveBeenLastCalledWith(
                        `Could not persist change-email for personId:${event.personId}, username:${fakeUsername}, error:EmailAddress could not be created`,
                    );
                });
            });

            describe('when enabled email DOES NOT exist and creating new email is successful', () => {
                it('should log info', async () => {
                    mockRepositoryFindMethods([personenkontext], rollenMap, spMap);
                    emailRepoMock.findEnabledByPerson.mockResolvedValueOnce(undefined);

                    emailRepoMock.save.mockResolvedValueOnce(emailAddress);

                    //mock createNewEmail
                    mockEmailFactoryCreateNewReturnsEnabledEmail(fakeEmailAddress);

                    //mock persisting new email
                    emailRepoMock.save.mockResolvedValueOnce(emailAddress);

                    await emailEventHandler.handleLdapPersonEntryRenamedEvent(event);

                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `Received LdapPersonEntryRenamedEvent, personId:${event.personId}, username:${event.username}, oldUsername:${fakeOldUsername}`,
                    );
                });
            });

            describe('when NO rolle is referencing a SP with Email kategorie', () => {
                describe('and NO deactivated email-addresses exist for person', () => {
                    it('should log info only', async () => {
                        mockRepositoryFindMethods(
                            [personenkontext],
                            rollenMap,
                            new Map<string, ServiceProvider<true>>(),
                        );
                        emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]); //mock: no deactivated email-addresses found

                        await emailEventHandler.handleLdapPersonEntryRenamedEvent(event);

                        expect(emailRepoMock.findByPersonSortedByUpdatedAtDesc).toHaveBeenCalledTimes(1);
                        expect(emailRepoMock.save).toHaveBeenCalledTimes(0);
                        expect(loggerMock.info).toHaveBeenCalledWith(
                            `Received LdapPersonEntryRenamedEvent, personId:${event.personId}, username:${event.username}, oldUsername:${fakeOldUsername}`,
                        );
                        expect(loggerMock.info).toHaveBeenLastCalledWith(
                            `Renamed person with personId:${event.personId}, username:${event.username} has no SP with Email and no existing DISABLED addresses, nothing to do`,
                        );
                    });
                });

                describe('and deactivated email-addresses exist for person', () => {
                    describe('when extracting email-domain from existing disabled address fails', () => {
                        it('should log error', async () => {
                            mockRepositoryFindMethods(
                                [personenkontext],
                                rollenMap,
                                new Map<string, ServiceProvider<true>>(),
                            );
                            const corruptedEmailAddress: EmailAddress<true> = DoFactory.createEmailAddress<true>(
                                true,
                                'addressCannotBeSplittedOnAtSymbol',
                            );
                            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([
                                corruptedEmailAddress,
                            ]); //mock: deactivated email-address found

                            await emailEventHandler.handleLdapPersonEntryRenamedEvent(event);

                            expect(emailRepoMock.findByPersonSortedByUpdatedAtDesc).toHaveBeenCalledTimes(1);
                            expect(emailRepoMock.save).toHaveBeenCalledTimes(0);
                            expect(loggerMock.info).toHaveBeenCalledWith(
                                `Received LdapPersonEntryRenamedEvent, personId:${event.personId}, username:${event.username}, oldUsername:${fakeOldUsername}`,
                            );
                            expect(loggerMock.error).toHaveBeenLastCalledWith(
                                `Could not extract domain from existing DISABLED email-address, personId:${event.personId}, username:${event.username}`,
                            );
                        });
                    });
                    describe('when extracting email-domain from existing disabled address succeeds', () => {
                        it('should create new email, disable it and log accordingly', async () => {
                            mockRepositoryFindMethods(
                                [personenkontext],
                                rollenMap,
                                new Map<string, ServiceProvider<true>>(),
                            );
                            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([emailAddress]); //mock: deactivated email-address found

                            const factoryResult: Result<EmailAddress<false>> = {
                                ok: true,
                                value: DoFactory.createEmailAddress<false>(false, fakeNewEmailAddress),
                            };

                            emailFactoryMock.createNewFromPersonIdAndDomain.mockResolvedValue(factoryResult);
                            emailRepoMock.save.mockResolvedValue(getEmail(fakeNewEmailAddress));
                            //mock person with username is found in getPersonUsernameOrError
                            personRepositoryMock.findById.mockResolvedValueOnce(
                                DoFactory.createPerson<true>(true, { id: fakePersonId, username: fakeUsername }),
                            );

                            await emailEventHandler.handleLdapPersonEntryRenamedEvent(event);

                            expect(emailRepoMock.findByPersonSortedByUpdatedAtDesc).toHaveBeenCalledTimes(1);
                            expect(emailRepoMock.save).toHaveBeenCalledTimes(1);
                            expect(loggerMock.info).toHaveBeenCalledWith(
                                `Received LdapPersonEntryRenamedEvent, personId:${event.personId}, username:${event.username}, oldUsername:${fakeOldUsername}`,
                            );
                            expect(loggerMock.info).toHaveBeenLastCalledWith(
                                `Successfully persisted new email with DISABLED status for address:${fakeNewEmailAddress}, personId:${event.personId}, username:${event.username}`,
                            );
                        });
                    });
                });
            });

            describe('when enabled email already exists and save disabling results in error', () => {
                it('should log error', async () => {
                    mockRepositoryFindMethods([personenkontext], rollenMap, spMap);
                    emailRepoMock.findEnabledByPerson.mockResolvedValueOnce(emailAddress);

                    emailRepoMock.save.mockResolvedValueOnce(new EmailAddressNotFoundError(fakeEmailAddress));

                    //mock createNewEmail
                    mockEmailFactoryCreateNewReturnsEnabledEmail(fakeEmailAddress);

                    //mock persisting new email
                    emailRepoMock.save.mockResolvedValueOnce(emailAddress);

                    await emailEventHandler.handleLdapPersonEntryRenamedEvent(event);

                    expect(loggerMock.info).toHaveBeenCalledWith(
                        `Received LdapPersonEntryRenamedEvent, personId:${event.personId}, username:${event.username}, oldUsername:${fakeOldUsername}`,
                    );
                    expect(loggerMock.error).toHaveBeenCalledWith(
                        `Could not DISABLE email, personId:${event.personId}, username:${event.username}, error:requested EmailAddress with the address:${fakeEmailAddress} was not found`,
                    );
                });
            });
        });
    });

    describe('handlePersonDeletedEvent', () => {
        let personId: string;
        let username: PersonUsername;
        let emailAddress: string;
        let event: PersonDeletedEvent;

        beforeEach(() => {
            personId = faker.string.uuid();
            username = faker.string.alpha();
            emailAddress = faker.internet.email();
            event = new PersonDeletedEvent(personId, username, emailAddress);
        });

        describe('when email microservice is enabled', () => {
            it('should not call deactivateEmailAddress when microservice is enabled', async () => {
                emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(true);

                await emailEventHandler.handlePersonDeletedEvent(event);
                expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Received PersonDeletedEvent'));
                expect(loggerMock.info).toHaveBeenCalledWith(
                    expect.stringContaining(
                        `Ignoring Event for personId:${event.personId} because email microservice is enabled`,
                    ),
                );
                expect(emailRepoMock.deactivateEmailAddress).not.toHaveBeenCalled();
            });
        });

        describe('when deletion is successful', () => {
            it('should log info', async () => {
                await emailEventHandler.handlePersonDeletedEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Successfully deactivated email-address:${emailAddress}, personId:${event.personId}, username:${event.username}`,
                );
            });
        });

        describe('when event does not provide email-address', () => {
            it('should log info about that', async () => {
                event = new PersonDeletedEvent(personId, username, undefined);
                await emailEventHandler.handlePersonDeletedEvent(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Cannot deactivate email-address, personId:${event.personId}, username:${event.username}, person did not have an email-address`,
                );
            });
        });

        describe('when email-address for deletion cannot be found', () => {
            it('should log error', async () => {
                emailRepoMock.deactivateEmailAddress.mockResolvedValueOnce(new EmailAddressNotFoundError());
                await emailEventHandler.handlePersonDeletedEvent(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Deactivation of email-address:${event.emailAddress} failed, personId:${event.personId}, username:${event.username}`,
                );
            });
        });
    });

    describe('handleDisabledOxUserChangedEvent', () => {
        let fakePersonId: string;
        let fakeKeycloakUsername: string;
        let fakeOXUserId: OXUserID;
        let fakeOXUserName: OXUserName;
        let fakeOXContextId: OXContextID;
        let fakeOXContextName: OXContextName;
        let fakeEmail: string;
        let event: DisabledOxUserChangedEvent;

        beforeEach(() => {
            fakePersonId = faker.string.uuid();
            fakeKeycloakUsername = faker.internet.username();
            fakeOXUserId = faker.string.numeric();
            fakeOXUserName = fakeKeycloakUsername;
            fakeOXContextId = faker.string.numeric();
            fakeOXContextName = 'context1';
            fakeEmail = faker.internet.email();
            event = new DisabledOxUserChangedEvent(
                fakePersonId,
                fakeKeycloakUsername,
                fakeOXUserId,
                fakeOXUserName,
                fakeOXContextId,
                fakeOXContextName,
                fakeEmail,
            );
        });

        describe('when email with REQUESTED status cannot be found by personId', () => {
            it('should log error', async () => {
                emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(undefined);

                await emailEventHandler.handleDisabledOxUserChangedEvent(event);

                expect(loggerMock.error).toHaveBeenLastCalledWith(
                    `Cannot find REQUESTED email-address for person with personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}, DISABLING not possible`,
                );
            });
        });

        describe('when persisting changes to email-address fails', () => {
            it('should log error', async () => {
                emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(
                    DoFactory.createEmailAddress<true>(true, fakeEmail),
                );

                emailRepoMock.save.mockResolvedValueOnce(new EntityCouldNotBeUpdated('EmailAddress', '1'));

                await emailEventHandler.handleDisabledOxUserChangedEvent(event);

                expect(loggerMock.error).toHaveBeenLastCalledWith(
                    `Could not DISABLE email for personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}, error:EmailAddress with ID 1 could not be updated`,
                );
            });
        });

        describe('when creation and persisting succeeds', () => {
            it('should log info', async () => {
                emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(
                    DoFactory.createEmailAddress<true>(true, fakeEmail),
                );

                emailRepoMock.save.mockResolvedValueOnce(getEmail(fakeEmail, EmailAddressStatus.DISABLED));

                await emailEventHandler.handleDisabledOxUserChangedEvent(event);

                expect(loggerMock.info).toHaveBeenLastCalledWith(
                    `Changed email-address:${fakeEmail} from REQUESTED to DISABLED, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}`,
                );
            });
        });
    });
});
