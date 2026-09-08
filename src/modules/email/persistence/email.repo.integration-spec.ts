import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM, NotFoundError, RequiredEntityData } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import assert from 'node:assert';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import {
    CommonTestModule,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DoFactory,
    expectOkResult,
} from '../../../../test/utils/index.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DomainError } from '../../../shared/error/index.js';
import { SortOrder } from '../../../shared/persistence/repository.enums.js';
import { OrganisationID, PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { OXUserID } from '../../../shared/types/ox-ids.types.js';
import { generatePassword } from '../../../shared/util/password-generator.js';
import { KeycloakUserService } from '../../keycloak-administration/index.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { PersonEmailResponse } from '../../person/api/person-email-response.js';
import { PersonFactory } from '../../person/domain/person.factory.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { EmailAddress, EmailAddressStatus } from '../domain/email-address.js';
import { EmailFactory } from '../domain/email.factory.js';
import { EmailInstanceConfig } from '../email-instance-config.js';
import { EmailModule } from '../email.module.js';
import { EmailAddressDeletionError } from '../error/email-address-deletion.error.js';
import { EmailAddressMissingOxUserIdError } from '../error/email-address-missing-ox-user-id.error.js';
import { EmailAddressNotFoundError } from '../error/email-address-not-found.error.js';
import { PersonAlreadyHasEnabledEmailAddressError } from '../error/person-already-has-enabled-email-address.error.js';
import { EmailAddressEntity } from './email-address.entity.js';
import {
    compareEmailAddressesByUpdatedAt,
    compareEmailAddressesByUpdatedAtDesc,
    EmailRepo,
    mapAggregateToData,
} from './email.repo.js';

describe('EmailRepo', () => {
    let module: TestingModule;
    let sut: EmailRepo;
    let emailFactory: EmailFactory;
    let personFactory: PersonFactory;
    let personRepository: PersonRepository;
    let organisationRepository: OrganisationRepository;
    let instanceConfig: EmailInstanceConfig;
    let keycloakUserServiceMock: DeepMocked<KeycloakUserService>;
    let orm: MikroORM;
    let em: EntityManager;

    let eventServiceMock: DeepMocked<EventRoutingLegacyKafkaService>;
    let loggerMock: DeepMocked<ClassLogger>;

    const mockEmailInstanceConfig: EmailInstanceConfig = {
        NON_ENABLED_EMAIL_ADDRESSES_DEADLINE_IN_DAYS: 100,
    };

    beforeAll(async () => {
        keycloakUserServiceMock = createMock<KeycloakUserService>(KeycloakUserService);
        keycloakUserServiceMock.create.mockImplementation(() => {
            return Promise.resolve({
                ok: true,
                value: faker.string.uuid(),
            });
        });
        keycloakUserServiceMock.setPassword.mockImplementation(() => {
            return Promise.resolve({
                ok: true,
                value: faker.string.alphanumeric(16),
            });
        });

        module = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), EmailModule],
            providers: [],
        })
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .overrideProvider(EventRoutingLegacyKafkaService)
            .useValue(createMock(EventRoutingLegacyKafkaService))
            .overrideProvider(EventRoutingLegacyKafkaService)
            .useValue(createMock(EventRoutingLegacyKafkaService))
            .overrideProvider(EmailInstanceConfig)
            .useValue(mockEmailInstanceConfig)
            .overrideProvider(KeycloakUserService)
            .useValue(keycloakUserServiceMock)
            .compile();
        sut = module.get(EmailRepo);
        emailFactory = module.get(EmailFactory);
        personFactory = module.get(PersonFactory);
        personRepository = module.get(PersonRepository);
        organisationRepository = module.get(OrganisationRepository);
        instanceConfig = module.get(EmailInstanceConfig);

        orm = module.get(MikroORM);
        em = module.get(EntityManager);

        eventServiceMock = module.get(EventRoutingLegacyKafkaService);
        loggerMock = module.get(ClassLogger);

        await DatabaseTestModule.setupDatabase(orm);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    async function createPerson(): Promise<Person<true>> {
        const personResult: Person<false> | DomainError = await personFactory.createNew({
            vorname: faker.person.firstName(),
            familienname: faker.person.lastName(),
            username: faker.internet.username(),
            password: generatePassword(),
        });
        if (personResult instanceof DomainError) {
            throw personResult;
        }
        const person: Person<true> | DomainError = await personRepository.create(personResult);
        if (person instanceof DomainError) {
            throw person;
        }

        return person;
    }

    async function createOrganisation(): Promise<Organisation<true>> {
        const parent: Organisation<false> = DoFactory.createOrganisation(false, {
            emailDomain: 'fake@schule-sh.de',
        });
        const parentPersisted: Organisation<true> = await organisationRepository.save(parent);
        const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
            administriertVon: parentPersisted.id,
            emailDomain: 'fake@fake-schule.de',
        });
        return organisationRepository.save(organisation);
    }

    async function createEmailAddress(
        status: EmailAddressStatus,
        personId: PersonID,
        organisationId: OrganisationID,
    ): Promise<EmailAddress<true>> {
        const email: Result<EmailAddress<false>> = await emailFactory.createNew(personId, organisationId);
        if (!email.ok) {
            throw new Error();
        }

        switch (status) {
            case EmailAddressStatus.ENABLED:
                email.value.enable();
                break;
            case EmailAddressStatus.REQUESTED:
                email.value.request();
                break;
            default:
                break;
        }
        const savedEmail: EmailAddress<true> | DomainError = await sut.save(email.value);
        assert(savedEmail instanceof EmailAddress);

        return savedEmail;
    }

    async function createPersonAndOrganisationAndEmailAddress(
        status: EmailAddressStatus,
    ): Promise<[Person<true>, Organisation<true>, EmailAddress<true>]> {
        const person: Person<true> = await createPerson();
        const organisation: Organisation<true> = await createOrganisation();
        const email: EmailAddress<true> = await createEmailAddress(status, person.id, organisation.id);

        return [person, organisation, email];
    }

    /**
     * Creates an EmailAddress directly via EntityManager instead of the EmailRepo
     * to allow for creation of invalid objects such as the second EmailAddress with ENABLED status for a person.
     * @param status
     * @param personId
     * @param address
     */
    async function createEmailAddressViaEM(
        status: EmailAddressStatus,
        personId: PersonID,
        oxUserId: OXUserID | undefined,
        address: string = faker.internet.email(),
        updatedAt?: Date,
    ): Promise<string> {
        const entityData: RequiredEntityData<EmailAddressEntity> = {
            status: status,
            address: address,
            personId: personId,
            id: faker.string.uuid(),
            oxUserId: oxUserId,
            updatedAt: updatedAt ?? faker.date.future(),
        };
        const emailAddressEntity: EmailAddressEntity = em.create(EmailAddressEntity, entityData);
        await em.persist(emailAddressEntity).flush();

        return emailAddressEntity.id;
    }

    afterAll(async () => {
        await module.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('findEnabledByPerson', () => {
        describe('when email-address is found for personId', () => {
            it('should return email with email-addresses by personId', async () => {
                const [person, ,]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                    await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.ENABLED);

                const foundEmail: Option<EmailAddress<true>> = await sut.findEnabledByPerson(person.id);
                if (!foundEmail) {
                    throw Error();
                }

                expect(foundEmail).toBeTruthy();
            });
        });

        describe('when person does NOT exist', () => {
            it('should return undefined', async () => {
                const foundEmail: Option<EmailAddress<true>> = await sut.findEnabledByPerson(faker.string.uuid());

                expect(foundEmail).toBeUndefined();
            });
        });
    });

    describe('findRequestedByPerson', () => {
        describe('when email-address is found for personId', () => {
            it('should return emailAddress by personId', async () => {
                const [person, ,]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                    await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.REQUESTED);

                const foundEmail: Option<EmailAddress<true>> = await sut.findRequestedByPerson(person.id);
                if (!foundEmail) {
                    throw Error();
                }

                expect(foundEmail).toBeTruthy();
            });
        });

        describe('when multiple email-addresses are found for personId', () => {
            it('should return most recently updated emailAddress by personId and log warning', async () => {
                const [person, organisation]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                    await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.REQUESTED);
                const newerEmailAddress: EmailAddress<true> = await createEmailAddress(
                    EmailAddressStatus.REQUESTED,
                    person.id,
                    organisation.id,
                );

                const foundEmail: Option<EmailAddress<true>> = await sut.findRequestedByPerson(person.id);
                if (!foundEmail) {
                    throw Error();
                }

                expect(loggerMock.warning).toHaveBeenCalledWith(
                    `Multiple EmailAddresses Found In REQUESTED Status For personId:${person.id}, Will Only Return address:${newerEmailAddress.address}`,
                );

                expect(foundEmail.address).toStrictEqual(newerEmailAddress.address);
            });
        });

        describe('when person does NOT exist', () => {
            it('should return null', async () => {
                const foundEmail: Option<EmailAddress<true>> = await sut.findRequestedByPerson(faker.string.uuid());

                expect(foundEmail).toBeNull();
            });
        });
    });

    describe('findByPerson', () => {
        describe('when no status is provided and email-address is found for personId', () => {
            it('should return email with email-addresses by personId', async () => {
                const [person, ,]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                    await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.REQUESTED);

                const foundEmails: Option<EmailAddress<true>[]> = await sut.findByPersonSortedByUpdatedAtDesc(
                    person.id,
                );
                if (!foundEmails) {
                    throw Error();
                }

                expect(foundEmails).toBeTruthy();
                expect(foundEmails).toHaveLength(1);
            });
        });

        describe('when no status is provided and person does NOT exist', () => {
            it('should return empty array', async () => {
                const foundEmails: Option<EmailAddress<true>[]> = await sut.findByPersonSortedByUpdatedAtDesc(
                    faker.string.uuid(),
                );

                expect(foundEmails).toEqual([]);
            });
        });

        describe('when ENABLED status is provided but only requested email-address is found for personId', () => {
            it('should return empty array', async () => {
                const [person, ,]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                    await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.REQUESTED);

                const foundEmails: Option<EmailAddress<true>[]> = await sut.findByPersonSortedByUpdatedAtDesc(
                    person.id,
                    EmailAddressStatus.ENABLED,
                );

                expect(foundEmails).toEqual([]);
            });
        });

        describe('when ENABLED status is provided and email-address is found for personId', () => {
            it('should return undefined', async () => {
                const [person, ,]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                    await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.ENABLED);

                const foundEmails: Option<EmailAddress<true>[]> = await sut.findByPersonSortedByUpdatedAtDesc(
                    person.id,
                    EmailAddressStatus.ENABLED,
                );
                if (!foundEmails) {
                    throw Error();
                }

                expect(foundEmails).toBeDefined();
                expect(foundEmails).toHaveLength(1);
            });
        });

        describe('when status is provided and person does NOT exist', () => {
            it('should return empty array', async () => {
                const foundEmails: Option<EmailAddress<true>[]> = await sut.findByPersonSortedByUpdatedAtDesc(
                    faker.string.uuid(),
                    EmailAddressStatus.ENABLED,
                );

                expect(foundEmails).toEqual([]);
            });
        });
    });

    describe('getEmailAddressAndStatusForPerson', () => {
        describe('when person has NO email-address assigned', () => {
            it('should return undefined', async () => {
                const person: Person<true> = await createPerson();

                const personEmailResponse: Option<PersonEmailResponse> =
                    await sut.getEmailAddressAndStatusForPerson(person);

                expect(personEmailResponse).toBeUndefined();
            });
        });

        describe('when person has enabled email-address assigned', () => {
            it('should return enabled address', async () => {
                const [person, organisation]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                    await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.REQUESTED);

                const emailEnabled: Result<EmailAddress<false>> = await emailFactory.createNew(
                    person.id,
                    organisation.id,
                );
                if (!emailEnabled.ok) {
                    throw new Error();
                }
                emailEnabled.value.enable();
                const savedEnabledEmail: EmailAddress<true> | DomainError = await sut.save(emailEnabled.value);
                if (savedEnabledEmail instanceof DomainError) {
                    throw new Error();
                }

                const personEmailResponse: Option<PersonEmailResponse> =
                    await sut.getEmailAddressAndStatusForPerson(person);

                if (!personEmailResponse) {
                    throw Error();
                }

                expect(personEmailResponse.status).toStrictEqual(EmailAddressStatus.ENABLED);
                expect(personEmailResponse.address).toStrictEqual(emailEnabled.value.address);
            });
        });

        describe('when person has no enabled email-address assigned', () => {
            it('should return the most recently updated one', async () => {
                const [person, organisation]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                    await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.REQUESTED);

                const emailFailed: Result<EmailAddress<false>> = await emailFactory.createNew(
                    person.id,
                    organisation.id,
                );
                if (!emailFailed.ok) {
                    throw new Error();
                }
                emailFailed.value.failed();
                const savedFailedEmail: EmailAddress<true> | DomainError = await sut.save(emailFailed.value);
                if (savedFailedEmail instanceof DomainError) {
                    throw new Error();
                }

                const personEmailResponse: Option<PersonEmailResponse> =
                    await sut.getEmailAddressAndStatusForPerson(person);

                if (!personEmailResponse) {
                    throw Error();
                }

                expect(personEmailResponse.status).toStrictEqual(EmailAddressStatus.FAILED);
                expect(personEmailResponse.address).toStrictEqual(emailFailed.value.address);
            });
        });
    });

    describe('getEmailAddressAndStatusForPersonIds', () => {
        async function createPersonsOrgasEmailAddresses(): Promise<[PersonID[], EmailAddress<true>]> {
            const [person1, , ea1]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.ENABLED);
            const [person2]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.REQUESTED);
            const [person3]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.DISABLED);
            const personIds: PersonID[] = [person1.id, person2.id, person3.id];

            return [personIds, ea1];
        }

        describe('when EmailAddresses with other status than ENABLED are found', () => {
            it('should result only containing ENABLED EmailAddresses', async () => {
                const [personIds, emailAddress1]: [PersonID[], EmailAddress<true>] =
                    await createPersonsOrgasEmailAddresses();
                const personId1: PersonID | undefined = personIds[0];
                assert(personId1);

                const responseMap: Result<
                    Map<PersonID, PersonEmailResponse>,
                    DomainError
                > = await sut.getEmailAddressAndStatusForPersonIds(personIds);

                expectOkResult(responseMap);
                expect(responseMap.value.size).toStrictEqual(1);
                expect(responseMap.value.get(personId1)?.address).toStrictEqual(emailAddress1.address);
            });
        });

        describe('when for (one) personId NO ENABLED EmailAddress can be found', () => {
            it('should return map with PersonEmailResponses for the other personIds', async () => {
                const personIdWithoutEnabledAddress: PersonID = faker.string.uuid();
                const [personIds, emailAddress1]: [PersonID[], EmailAddress<true>] =
                    await createPersonsOrgasEmailAddresses();
                const personId1: PersonID | undefined = personIds[0];
                assert(personId1);

                const extendedPersonIds: PersonID[] = personIds;
                extendedPersonIds.push(personIdWithoutEnabledAddress);

                const responseMap: Result<
                    Map<PersonID, PersonEmailResponse>,
                    DomainError
                > = await sut.getEmailAddressAndStatusForPersonIds(extendedPersonIds);

                expectOkResult(responseMap);
                expect(responseMap.value.size).toStrictEqual(1);
                expect(responseMap.value.get(personId1)?.address).toStrictEqual(emailAddress1.address);
                expect(responseMap.value.get(personIdWithoutEnabledAddress)).toBeUndefined();
            });
        });

        describe('when for (one) personId multiple EmailAddresses are found', () => {
            it('should sort, return map with PersonEmailResponses containing most recent address and log error', async () => {
                const [personIds, emailAddress1]: [PersonID[], EmailAddress<true>] =
                    await createPersonsOrgasEmailAddresses();
                const personId1: PersonID | undefined = personIds[0];
                assert(personId1);

                const moreRecentAddress: string = faker.internet.email();
                await createEmailAddressViaEM(
                    EmailAddressStatus.ENABLED,
                    personId1,
                    faker.string.numeric(),
                    moreRecentAddress,
                );

                const responseMap: Result<
                    Map<PersonID, PersonEmailResponse>,
                    DomainError
                > = await sut.getEmailAddressAndStatusForPersonIds(personIds);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Found multiple ENABLED EmailAddresses, treating ${moreRecentAddress} as latest address, personId:${personId1}`,
                );

                expectOkResult(responseMap);
                expect(responseMap.value.size).toStrictEqual(1);
                expect(responseMap.value.get(personId1)?.address).toStrictEqual(moreRecentAddress);
                expect(responseMap.value.get(personId1)?.address).not.toStrictEqual(emailAddress1.address);
            });
        });
    });

    describe('findByAddress', () => {
        describe('when emailAddress CANNOT be found via address', () => {
            it('should throw error', async () => {
                const emailAddress: Option<EmailAddress<true>> = await sut.findByAddress(faker.internet.email());
                expect(emailAddress).toBeUndefined();
            });
        });

        describe('when emailAddress can be found via address', () => {
            it('should return emailAddress aggregate', async () => {
                const [, , savedRequestedEmail]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                    await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.REQUESTED);

                const emailAddress: Option<EmailAddress<true>> = await sut.findByAddress(savedRequestedEmail.address);
                if (!emailAddress) {
                    throw new Error();
                }

                expect(emailAddress.address).toStrictEqual(savedRequestedEmail.address);
            });
        });
    });

    describe('getByDeletedStatusOrUpdatedAtExceedsDeadline', () => {
        describe('when exceeded EmailAddresses, EmailAddresses with an DELETED status and non-exceeded EmailAddresses exist', () => {
            it('should return only EmailAddresses which exceed the deadline or an DELETED status', async () => {
                const person: Person<true> = await createPerson();
                const oxUserId: OXUserID = faker.string.numeric();
                const addressRequestedExceeded: string = faker.internet.email();
                const addressFailedExceeded: string = faker.internet.email();
                const addressDisabledExceeded: string = faker.internet.email();
                const addressDeletedLdapExceeded: string = faker.internet.email();
                const addressDeletedOxExceeded: string = faker.internet.email();
                const addressDeletedExceeded: string = faker.internet.email();
                const addressDeletedLdapNotExceeded: string = faker.internet.email();
                const addressDeletedOxNotExceeded: string = faker.internet.email();
                const addressDeletedNotExceeded: string = faker.internet.email();

                const addressRequestedNotExceeded: string = faker.internet.email();
                const addressFailedNotExceeded: string = faker.internet.email();
                const addressDisabledNotExceeded: string = faker.internet.email();

                const today: Date = new Date();
                const dateInPast: Date = new Date();
                dateInPast.setDate(dateInPast.getDate() - 180);

                await createEmailAddressViaEM(
                    EmailAddressStatus.REQUESTED,
                    person.id,
                    oxUserId,
                    addressRequestedExceeded,
                    dateInPast,
                );
                await createEmailAddressViaEM(
                    EmailAddressStatus.FAILED,
                    person.id,
                    oxUserId,
                    addressFailedExceeded,
                    dateInPast,
                );
                await createEmailAddressViaEM(
                    EmailAddressStatus.DISABLED,
                    person.id,
                    oxUserId,
                    addressDisabledExceeded,
                    dateInPast,
                );
                await createEmailAddressViaEM(
                    EmailAddressStatus.DELETED_LDAP,
                    person.id,
                    oxUserId,
                    addressDeletedLdapExceeded,
                    dateInPast,
                );
                await createEmailAddressViaEM(
                    EmailAddressStatus.DELETED_OX,
                    person.id,
                    oxUserId,
                    addressDeletedOxExceeded,
                    dateInPast,
                );
                await createEmailAddressViaEM(
                    EmailAddressStatus.DELETED,
                    person.id,
                    oxUserId,
                    addressDeletedExceeded,
                    dateInPast,
                );
                await createEmailAddressViaEM(
                    EmailAddressStatus.DELETED_LDAP,
                    person.id,
                    oxUserId,
                    addressDeletedLdapNotExceeded,
                    today,
                );
                await createEmailAddressViaEM(
                    EmailAddressStatus.DELETED_OX,
                    person.id,
                    oxUserId,
                    addressDeletedOxNotExceeded,
                    today,
                );
                await createEmailAddressViaEM(
                    EmailAddressStatus.DELETED,
                    person.id,
                    oxUserId,
                    addressDeletedNotExceeded,
                    today,
                );

                await createEmailAddressViaEM(
                    EmailAddressStatus.REQUESTED,
                    person.id,
                    oxUserId,
                    addressRequestedNotExceeded,
                    today,
                );
                await createEmailAddressViaEM(
                    EmailAddressStatus.FAILED,
                    person.id,
                    oxUserId,
                    addressFailedNotExceeded,
                    today,
                );
                await createEmailAddressViaEM(
                    EmailAddressStatus.DISABLED,
                    person.id,
                    oxUserId,
                    addressDisabledNotExceeded,
                    today,
                );

                const [deleteList, total]: Counted<EmailAddress<true>> =
                    await sut.getByDeletedStatusOrUpdatedAtExceedsDeadline(10);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Fetching EmailAddresses For Deletion, deadlineInDays:${100}`,
                );
                expect(deleteList).toHaveLength(9);
                expect(total).toBe(9);
                expect(deleteList).toContainEqual(
                    expect.objectContaining({
                        address: addressRequestedExceeded,
                    }),
                );
                expect(deleteList).toContainEqual(
                    expect.objectContaining({
                        address: addressFailedExceeded,
                    }),
                );
                expect(deleteList).toContainEqual(
                    expect.objectContaining({
                        address: addressDisabledExceeded,
                    }),
                );
                expect(deleteList).toContainEqual(
                    expect.objectContaining({
                        address: addressDeletedLdapExceeded,
                    }),
                );
                expect(deleteList).toContainEqual(
                    expect.objectContaining({
                        address: addressDeletedOxExceeded,
                    }),
                );
                expect(deleteList).toContainEqual(
                    expect.objectContaining({
                        address: addressDeletedExceeded,
                    }),
                );
                expect(deleteList).toContainEqual(
                    expect.objectContaining({
                        address: addressDeletedLdapNotExceeded,
                    }),
                );
                expect(deleteList).toContainEqual(
                    expect.objectContaining({
                        address: addressDeletedOxNotExceeded,
                    }),
                );
                expect(deleteList).toContainEqual(
                    expect.objectContaining({
                        address: addressDeletedNotExceeded,
                    }),
                );
            });
        });

        describe('when emailInstanceConfig does NOT provide NON_ENABLED_EMAIL_ADDRESS_DEADLINE_IN_DAYS', () => {
            it('should use NON_ENABLED_EMAIL_ADDRESS_DEADLINE_IN_DAYS_DEFAULT of 180 days', async () => {
                instanceConfig.NON_ENABLED_EMAIL_ADDRESSES_DEADLINE_IN_DAYS = undefined;
                const [deleteList]: Counted<EmailAddress<true>> =
                    await sut.getByDeletedStatusOrUpdatedAtExceedsDeadline(10);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Fetching EmailAddresses For Deletion, deadlineInDays:${180}`,
                );
                expect(deleteList).toHaveLength(0);
            });
        });
    });

    describe('deactivateEmailAddress', () => {
        describe('when email-address exists', () => {
            it('should disable it and return EmailAddressEntity', async () => {
                const [, , savedEmail]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                    await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.ENABLED);

                const currentAddress: Option<string> = savedEmail.currentAddress;
                if (!currentAddress) {
                    throw new Error();
                }
                const deactivationResult: EmailAddressEntity | EmailAddressNotFoundError =
                    await sut.deactivateEmailAddress(currentAddress);

                expect(deactivationResult).toBeInstanceOf(EmailAddressEntity);
            });
        });

        describe('when email-address does NOT exist', () => {
            it('should return EmailAddressNotFoundError', async () => {
                const deactivationResult: EmailAddressEntity | EmailAddressNotFoundError =
                    await sut.deactivateEmailAddress(faker.internet.email());

                expect(deactivationResult).toBeInstanceOf(EmailAddressNotFoundError);
            });
        });
    });

    describe('save', () => {
        describe('when address is already persisted', () => {
            it('should use update method and return EmailAddress aggregate', async () => {
                const [, , persistedValidEmail]: [Person<true>, Organisation<true>, EmailAddress<true>] =
                    await createPersonAndOrganisationAndEmailAddress(EmailAddressStatus.ENABLED);

                persistedValidEmail.disable();
                const persistedDisabledEmail: EmailAddress<true> | DomainError = await sut.save(persistedValidEmail);

                expect(persistedDisabledEmail).toBeInstanceOf(EmailAddress);
            });
        });

        describe('when address is already persisted BUT cannot be found in DB', () => {
            it('should return EmailAddressNotFoundError', async () => {
                const person: Person<true> = await createPerson();
                const emailAddress: EmailAddress<true> = emailFactory.construct(
                    faker.string.uuid(),
                    faker.date.past(),
                    faker.date.recent(),
                    person.id,
                    faker.internet.email(),
                    EmailAddressStatus.ENABLED,
                );

                const persistenceResult: EmailAddress<true> | DomainError = await sut.save(emailAddress);

                expect(persistenceResult).toBeInstanceOf(EmailAddressNotFoundError);
            });
        });

        describe('when address with status ENABLED is already present for person', () => {
            it('should return PersonAlreadyHasEnabledEmailAddressError', async () => {
                const person: Person<true> = await createPerson();
                const organisation: Organisation<true> = await createOrganisation();
                const email: Result<EmailAddress<false>> = await emailFactory.createNew(person.id, organisation.id);
                if (!email.ok) {
                    throw Error();
                }
                email.value.enable();
                const persistedValidEmail: EmailAddress<true> | DomainError = await sut.save(email.value);
                if (persistedValidEmail instanceof DomainError) {
                    throw new Error();
                }

                const person2: Person<true> = await createPerson();
                const email2: Result<EmailAddress<false>> = await emailFactory.createNew(person2.id, organisation.id);
                if (!email2.ok) {
                    throw Error();
                }
                email2.value.enable();
                const persistedValidEmail2: EmailAddress<true> | DomainError = await sut.save(email.value);

                const error: PersonAlreadyHasEnabledEmailAddressError = new PersonAlreadyHasEnabledEmailAddressError(
                    person.id,
                    email.value.address,
                );
                expect(persistedValidEmail2).toEqual(error);
            });
        });
    });

    describe('deleteById', () => {
        describe('when EmailAddress with specified id exists', () => {
            let person: Person<true>;
            let address: string;
            let today: Date;

            beforeEach(async () => {
                person = await createPerson();
                address = faker.internet.email();
                today = new Date();
            });

            describe('but oxUserId is undefined', () => {
                it('should delete EmailAddress in DB, publish EmailAddressDeletedInDatabaseEvent and return undefined', async () => {
                    const addressId: string = await createEmailAddressViaEM(
                        EmailAddressStatus.REQUESTED,
                        person.id,
                        undefined,
                        address,
                        today,
                    );

                    const deletionResult1: Option<DomainError> = await sut.deleteById(addressId);
                    const emailAddress: Option<EmailAddress<true>> = await sut.findByAddress(address);

                    expect(deletionResult1).toBeDefined();
                    expect(deletionResult1).toStrictEqual(new EmailAddressMissingOxUserIdError(addressId, address));
                    expect(emailAddress).toBeUndefined();
                    expect(eventServiceMock.publish).toHaveBeenCalledTimes(0);
                });
            });
            describe('and oxUserId is defined', () => {
                it('should delete EmailAddress in DB, publish EmailAddressDeletedInDatabaseEvent and return undefined', async () => {
                    const oxUserId: OXUserID = faker.string.numeric();
                    const addressId: string = await createEmailAddressViaEM(
                        EmailAddressStatus.REQUESTED,
                        person.id,
                        oxUserId,
                        address,
                        today,
                    );

                    const deletionResult1: Option<DomainError> = await sut.deleteById(addressId);
                    const emailAddress: Option<EmailAddress<true>> = await sut.findByAddress(address);

                    expect(deletionResult1).toBeUndefined();
                    expect(emailAddress).toBeUndefined();
                    expect(eventServiceMock.publish).toHaveBeenCalledWith(
                        expect.objectContaining({
                            personId: person.id,
                            oxUserId: oxUserId,
                            emailAddressId: addressId,
                            address: address,
                        }),
                        expect.objectContaining({
                            personId: person.id,
                            oxUserId: oxUserId,
                            emailAddressId: addressId,
                            address: address,
                        }),
                    );
                });
            });
        });

        describe('when EmailAddress with specified id does NOT exist', () => {
            it('should return Error', async () => {
                const address2Id: string = faker.string.uuid();
                const notFoundError: NotFoundError = new NotFoundError(
                    `EmailAddressEntity not found ({ id: '${address2Id}' })`,
                );
                const deletionResult2: Option<DomainError> = await sut.deleteById(address2Id);

                expect(deletionResult2).toBeInstanceOf(EmailAddressDeletionError);
                expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                    'Error during deletion of EmailAddress',
                    notFoundError,
                );
            });
        });
    });

    describe('setUpdatedAtToFixedPointInTime', () => {
        it('should update the updatedAt field', async () => {
            const person: Person<true> = await createPerson();
            const address: string = faker.internet.email();
            const addressId: string = await createEmailAddressViaEM(
                EmailAddressStatus.DISABLED,
                person.id,
                undefined,
                address,
            );

            await sut.setUpdatedAtToFixedPointInTime(addressId);
            const emailAddress: Option<EmailAddress<true>> = await sut.findByAddress(address);

            expect(emailAddress?.updatedAt).toEqual(new Date(2027, 7));
        });
    });

    describe('compareFunctions', () => {
        const emailAddressUndefinedUpdatedAt: EmailAddressEntity = createMock<EmailAddressEntity>(EmailAddressEntity, {
            updatedAt: undefined,
        });
        const emailAddress1: EmailAddressEntity = createMock<EmailAddressEntity>(EmailAddressEntity, {
            updatedAt: faker.date.recent(),
        });
        const emailAddress2: EmailAddressEntity = createMock<EmailAddressEntity>(EmailAddressEntity, {
            updatedAt: faker.date.past(),
        });
        describe('compareEmailAddressesByUpdatedAt', () => {
            describe('when sortOrder is ASC', () => {
                describe('when first parameter updatedAt and second parameter updatedAt are equal', () => {
                    it('should return 0', () => {
                        const result: number = compareEmailAddressesByUpdatedAt(
                            emailAddress1,
                            emailAddress1,
                            SortOrder.ASC,
                        );
                        expect(result).toStrictEqual(0);
                    });
                });

                describe('when first parameter updatedAt is UNDEFINED and second parameter updatedAt is defined', () => {
                    it('should return Number.MAX_VALUE', () => {
                        const result: number = compareEmailAddressesByUpdatedAt(
                            emailAddressUndefinedUpdatedAt,
                            emailAddress2,
                            SortOrder.ASC,
                        );
                        expect(result).toStrictEqual(Number.MAX_VALUE);
                    });
                });

                describe('when first parameter is defined and second parameter updatedAt is UNDEFINED', () => {
                    it('should return Number.MIN_VALUE', () => {
                        const result: number = compareEmailAddressesByUpdatedAt(
                            emailAddress1,
                            emailAddressUndefinedUpdatedAt,
                            SortOrder.ASC,
                        );
                        expect(result).toStrictEqual(Number.MIN_VALUE);
                    });
                });

                describe('when first parameter updatedAt is more recent than second parameter updatedAt', () => {
                    it('should return greater than 0', () => {
                        const result: number = compareEmailAddressesByUpdatedAt(
                            emailAddress1,
                            emailAddress2,
                            SortOrder.ASC,
                        );
                        expect(result).toBeGreaterThan(0);
                    });
                });
                describe('when second parameter updatedAt is more recent than first parameter updatedAt', () => {
                    it('should return less than 0', () => {
                        const result: number = compareEmailAddressesByUpdatedAt(
                            emailAddress2,
                            emailAddress1,
                            SortOrder.ASC,
                        );
                        expect(result).toBeLessThan(0);
                    });
                });
            });

            describe('when sortOrder is DESC', () => {
                describe('when first parameter updatedAt and second parameter updatedAt are equal', () => {
                    it('should return 0', () => {
                        const result: number = compareEmailAddressesByUpdatedAt(
                            emailAddress1,
                            emailAddress1,
                            SortOrder.DESC,
                        );
                        expect(result).toStrictEqual(0);
                    });
                });

                describe('when first parameter updatedAt is UNDEFINED and second parameter updatedAt is defined', () => {
                    it('should return Number.MAX_VALUE', () => {
                        const result: number = compareEmailAddressesByUpdatedAt(
                            emailAddress2,
                            emailAddressUndefinedUpdatedAt,
                            SortOrder.DESC,
                        );
                        expect(result).toStrictEqual(Number.MAX_VALUE);
                    });
                });

                describe('when first parameter is defined and second parameter updatedAt is UNDEFINED', () => {
                    it('should return Number.MIN_VALUE', () => {
                        const result: number = compareEmailAddressesByUpdatedAt(
                            emailAddressUndefinedUpdatedAt,
                            emailAddress1,
                            SortOrder.DESC,
                        );
                        expect(result).toStrictEqual(Number.MIN_VALUE);
                    });
                });

                describe('when first parameter updatedAt is more recent than second parameter updatedAt', () => {
                    it('should return greater than 0', () => {
                        const result: number = compareEmailAddressesByUpdatedAt(
                            emailAddress2,
                            emailAddress1,
                            SortOrder.DESC,
                        );
                        expect(result).toBeGreaterThan(0);
                    });
                });
                describe('when second parameter updatedAt is more recent than first parameter updatedAt', () => {
                    it('should return less than 0', () => {
                        const result: number = compareEmailAddressesByUpdatedAt(
                            emailAddress1,
                            emailAddress2,
                            SortOrder.DESC,
                        );
                        expect(result).toBeLessThan(0);
                    });
                });
            });
        });
        describe('compareEmailAddressesByUpdatedAtDesc', () => {
            describe('when first parameter updatedAt and second parameter updatedAt are equal', () => {
                it('should return 0', () => {
                    const result: number = compareEmailAddressesByUpdatedAtDesc(emailAddress1, emailAddress1);
                    expect(result).toStrictEqual(0);
                });
            });
            describe('when first parameter updatedAt greater than second parameter updatedAt', () => {
                it('should return less than 0', () => {
                    const result: number = compareEmailAddressesByUpdatedAtDesc(emailAddress1, emailAddress2);
                    expect(result).toBeLessThan(0);
                });
            });
            describe('when first parameter updatedAt less than second parameter updatedAt are equal', () => {
                it('should return greater than 0', () => {
                    const result: number = compareEmailAddressesByUpdatedAtDesc(emailAddress2, emailAddress1);
                    expect(result).toBeGreaterThan(0);
                });
            });
        });
    });

    describe('mapAggregateToData', () => {
        const expectedProperties: string[] = ['id', 'personId', 'address', 'oxUserId', 'status'];

        describe('when oxUserId is provided', () => {
            it('should return EmailAddress RequiredEntityData', () => {
                const person: EmailAddress<true> = EmailAddress.construct(
                    faker.string.uuid(),
                    faker.date.past(),
                    faker.date.recent(),
                    faker.string.uuid(),
                    faker.internet.email(),
                    faker.helpers.enumValue(EmailAddressStatus),
                    faker.string.numeric(),
                );

                const result: RequiredEntityData<EmailAddressEntity> = mapAggregateToData(person);

                expectedProperties.forEach((prop: string) => {
                    expect(result).toHaveProperty(prop);
                });
            });
        });

        describe('when oxUserId is NOT provided', () => {
            it('should return EmailAddress RequiredEntityData', () => {
                const person: EmailAddress<true> = EmailAddress.construct(
                    faker.string.uuid(),
                    faker.date.past(),
                    faker.date.recent(),
                    faker.string.uuid(),
                    faker.internet.email(),
                    faker.helpers.enumValue(EmailAddressStatus),
                );

                const result: RequiredEntityData<EmailAddressEntity> = mapAggregateToData(person);

                expectedProperties.forEach((prop: string) => {
                    expect(result).toHaveProperty(prop);
                });
            });
        });
    });
});
