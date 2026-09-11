import { faker } from '@faker-js/faker';
import { Collection, EntityManager, MikroORM, ref, RequiredEntityData } from '@mikro-orm/core';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import {
    ConfigTestModule,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DoFactory,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { createAndPersistOrganisation } from '../../../../test/utils/organisation-test-helper.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DuplicatePersonalnummerError } from '../../../shared/error/duplicate-personalnummer.error.js';
import {
    DomainError,
    EntityCouldNotBeDeleted,
    EntityNotFoundError,
    InvalidCharacterSetError,
    InvalidNameError,
    KeycloakClientError,
    MismatchedRevisionError,
    MissingPermissionsError,
} from '../../../shared/error/index.js';
import { BaseEvent } from '../../../shared/events/index.js';
import { KafkaEvent } from '../../../shared/events/kafka-event.js';
import { KafkaPersonDeletedEvent } from '../../../shared/events/kafka-person-deleted.event.js';
import { KafkaPersonRenamedEvent } from '../../../shared/events/kafka-person-renamed-event.js';
import { PersonDeletedEvent } from '../../../shared/events/person-deleted.event.js';
import { PersonRenamedEvent } from '../../../shared/events/person-renamed-event.js';
import { PersonenkontextEventKontextData } from '../../../shared/events/personenkontext-event.types.js';
import { ScopeOrder } from '../../../shared/persistence/scope.enums.js';
import { PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { OXUserID } from '../../../shared/types/ox-ids.types.js';
import { PermittedOrgas, PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { EmailAddressStatus } from '../../email/domain/email-address.js';
import { EmailAddressEntity } from '../../email/persistence/email-address.entity.js';
import { UserLock } from '../../keycloak-administration/domain/user-lock.js';
import { KeycloakUserService, PersonHasNoKeycloakId } from '../../keycloak-administration/index.js';
import { UserLockRepository } from '../../keycloak-administration/repository/user-lock.repository.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationEntity } from '../../organisation/persistence/organisation.entity.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { PersonenkontextFactory } from '../../personenkontext/domain/personenkontext.factory.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepoInternal } from '../../personenkontext/persistence/internal-dbiam-personenkontext.repo.js';
import { PersonenkontextEntity } from '../../personenkontext/persistence/personenkontext.entity.js';
import { RollenArt, RollenMerkmal } from '../../rolle/domain/rolle.enums.js';
import { RolleFactory } from '../../rolle/domain/rolle.factory.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RolleEntity } from '../../rolle/entity/rolle.entity.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { FamiliennameForPersonWithTrailingSpaceError } from '../domain/familienname-with-trailing-space.error.js';
import { DownstreamKeycloakError } from '../domain/person-keycloak.error.js';
import { PersonExternalIdType, PersonLockOccasion, SortFieldPerson } from '../domain/person.enums.js';
import { Person } from '../domain/person.js';
import { PersonalnummerRequiredError } from '../domain/personalnummer-required.error.js';
import { PersonalNummerForPersonWithTrailingSpaceError } from '../domain/personalnummer-with-trailing-space.error.js';
import { PersonUpdateOutdatedError } from '../domain/update-outdated.error.js';
import { UsernameGeneratorService } from '../domain/username-generator.service.js';
import { VornameForPersonWithTrailingSpaceError } from '../domain/vorname-with-trailing-space.error.js';
import { PersonExternalIdMappingEntity } from './external-id-mappings.entity.js';
import { PersonEntity } from './person.entity.js';
import {
    getOxUserId,
    mapAggregateToData,
    mapEntityToAggregate,
    mapEntityToAggregateInplace,
    PersonenQueryParams,
    PersonRepository,
    PersonWithoutOrgDeleteListResult,
} from './person.repository.js';
import { PersonScope } from './person.scope.js';

describe('PersonRepository Integration', () => {
    let module: TestingModule;
    let sut: PersonRepository;
    let orm: MikroORM;
    let em: EntityManager;
    let kcUserServiceMock: DeepMocked<KeycloakUserService>;
    let usernameGeneratorService: DeepMocked<UsernameGeneratorService>;
    let personPermissionsMock: DeepMocked<PersonPermissions>;
    let eventServiceMock: DeepMocked<EventRoutingLegacyKafkaService>;
    let rolleFactory: RolleFactory;
    let rolleRepo: RolleRepo;
    let dbiamPersonenkontextRepoInternal: DBiamPersonenkontextRepoInternal;
    let personenkontextFactory: PersonenkontextFactory;
    let userLockRepository: UserLockRepository;
    let organisationRepository: OrganisationRepository;
    let loggerMock: DeepMocked<ClassLogger>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true })],
            providers: [
                PersonRepository,
                OrganisationRepository,
                ConfigService,
                {
                    provide: EmailResolverService,
                    useValue: createMock(EmailResolverService),
                },
                {
                    provide: ServiceProviderRepo,
                    useValue: createMock(ServiceProviderRepo),
                },
                {
                    provide: EventRoutingLegacyKafkaService,
                    useValue: createMock(EventRoutingLegacyKafkaService),
                },
                {
                    provide: UsernameGeneratorService,
                    useValue: createMock(UsernameGeneratorService),
                },
                {
                    provide: KeycloakUserService,
                    useValue: createMock(KeycloakUserService),
                },
                // the following are required to prepare the test for findByIds()
                OrganisationRepository,
                RolleFactory,
                RolleRepo,
                DBiamPersonenkontextRepoInternal,
                PersonenkontextFactory,
                UserLockRepository,
            ],
        })
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .compile();
        sut = module.get(PersonRepository);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);
        personPermissionsMock = createPersonPermissionsMock();

        kcUserServiceMock = module.get(KeycloakUserService);
        usernameGeneratorService = module.get(UsernameGeneratorService);
        rolleFactory = module.get(RolleFactory);
        rolleRepo = module.get(RolleRepo);
        dbiamPersonenkontextRepoInternal = module.get(DBiamPersonenkontextRepoInternal);
        personenkontextFactory = module.get(PersonenkontextFactory);
        userLockRepository = module.get(UserLockRepository);
        organisationRepository = module.get(OrganisationRepository);
        eventServiceMock = module.get(EventRoutingLegacyKafkaService);
        loggerMock = module.get(ClassLogger);
        emailResolverServiceMock = module.get(EmailResolverService);
        await DatabaseTestModule.setupDatabase(orm);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await module.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    type SavedPersonProps = { keycloackID: string };
    async function savePerson(
        withPersonalnummer: boolean = false,
        props: Partial<SavedPersonProps & { vorname?: string; familienname?: string; username?: string }> = {},
    ): Promise<Person<true>> {
        usernameGeneratorService.generateUsername.mockResolvedValueOnce({
            ok: true,
            value: props.username ?? 'testusername',
        });
        const defaultProps: SavedPersonProps = {
            keycloackID: faker.string.uuid(),
        };

        const vorname: string = props.vorname ?? faker.person.firstName();
        const familienname: string = props.familienname ?? faker.person.lastName();

        const personProps: {
            keycloackID: string;
        } = { ...defaultProps, ...props };
        const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
            familienname,
            vorname,
            personalnummer: withPersonalnummer ? faker.finance.pin(7) : undefined,
        });

        if (person instanceof DomainError) {
            throw person;
        }

        kcUserServiceMock.create.mockResolvedValueOnce({
            ok: true,
            value: personProps.keycloackID,
        });
        kcUserServiceMock.setPassword.mockResolvedValueOnce({
            ok: true,
            value: '',
        });
        const savedPerson: Person<true> | DomainError = await sut.save(person);

        if (savedPerson instanceof DomainError) {
            throw savedPerson;
        } else {
            return savedPerson;
        }
    }

    function getFakeEmailAddress(status?: EmailAddressStatus, address?: string, oxUserId?: string): EmailAddressEntity {
        const emailAddressEntity: EmailAddressEntity = new EmailAddressEntity();
        emailAddressEntity.status = status ?? EmailAddressStatus.ENABLED;
        emailAddressEntity.address = address ?? faker.internet.email();
        emailAddressEntity.oxUserId = oxUserId ?? faker.string.numeric();

        return emailAddressEntity;
    }

    describe('findByKeycloakUserId', () => {
        describe('when found by keycloakUserId', () => {
            it('should return found person', async () => {
                const personSaved: Person<true> = await savePerson();
                if (personSaved.keycloakUserId) {
                    const foundPerson: Option<Person<true>> = await sut.findByKeycloakUserId(
                        personSaved.keycloakUserId,
                    );
                    expect(foundPerson).toBeInstanceOf(Person);
                } else {
                    throw new Error();
                }
            });
        });

        describe('when not found by keycloakUserId', () => {
            it('should return null', async () => {
                const foundPerson: Option<Person<true>> = await sut.findByKeycloakUserId(faker.string.uuid());

                expect(foundPerson).toBeNull();
            });
        });
    });

    describe('findByPersonIds', () => {
        it('should return found person', async () => {
            const personA: Person<true> = await savePerson(false, { username: 'testuser1' });
            const personB: Person<true> = await savePerson(false, { username: 'testuser2' });
            const personC: Person<true> = await savePerson(false, { username: 'testuser3' });

            const foundPersons: Person<true>[] = await sut.findByPersonIds([personA.id, personB.id]);

            expect(foundPersons.length).toEqual(2);
            expect(foundPersons.findIndex((p: Person<true>) => p.id === personA.id)).not.toEqual(-1);
            expect(foundPersons.findIndex((p: Person<true>) => p.id === personB.id)).not.toEqual(-1);
            expect(foundPersons.findIndex((p: Person<true>) => p.id === personC.id)).toEqual(-1);
        });
    });

    describe('findWithRolleAndNoOtherItslearningKontexteByCursor', () => {
        it('should return found persons', async () => {
            const personA: Person<true> = await savePerson(false);
            const orga: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, { itslearningEnabled: true }),
            );
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                externalSystem: ServiceProviderSystem.ITSLEARNING,
            });
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, { serviceProviderIds: [serviceProvider.id] }),
            );
            if (rolle instanceof DomainError) {
                throw rolle;
            }
            await dbiamPersonenkontextRepoInternal.save(
                DoFactory.createPersonenkontext(false, {
                    organisationId: orga.id,
                    personId: personA.id,
                    rolleId: rolle.id,
                }),
            );

            let personen: Person<true>[] = [];
            let cursor: string | undefined;

            [personen, cursor] = await sut.findWithRolleAndNoOtherItslearningKontexteByCursor(rolle.id, 1, cursor);

            expect(personen).toHaveLength(1);
            expect(cursor).toBeDefined();

            [personen, cursor] = await sut.findWithRolleAndNoOtherItslearningKontexteByCursor(rolle.id, 1, cursor);

            expect(personen).toHaveLength(0);
            expect(cursor).toBeUndefined();
        });

        it('should not return persons that already have itslearning', async () => {
            const personA: Person<true> = await savePerson(false);
            const orgaA: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, { itslearningEnabled: true }),
            );
            const orgaB: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, { itslearningEnabled: true }),
            );
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                externalSystem: ServiceProviderSystem.ITSLEARNING,
            });
            const rolleA: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, { serviceProviderIds: [] }),
            );
            const rolleB: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, { serviceProviderIds: [serviceProvider.id] }),
            );
            if (rolleA instanceof DomainError) {
                throw rolleA;
            }
            if (rolleB instanceof DomainError) {
                throw rolleB;
            }
            await dbiamPersonenkontextRepoInternal.save(
                DoFactory.createPersonenkontext(false, {
                    organisationId: orgaA.id,
                    personId: personA.id,
                    rolleId: rolleA.id,
                }),
            );
            await dbiamPersonenkontextRepoInternal.save(
                DoFactory.createPersonenkontext(false, {
                    organisationId: orgaB.id,
                    personId: personA.id,
                    rolleId: rolleB.id,
                }),
            );

            const [personen, cursor]: [Person<true>[], string | undefined] =
                await sut.findWithRolleAndNoOtherItslearningKontexteByCursor(rolleA.id, 1);

            expect(personen).toHaveLength(0);
            expect(cursor).toBeUndefined();
        });

        it('should not return persons that are not at itslearning orgas', async () => {
            const personA: Person<true> = await savePerson(false);
            const orga: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, { itslearningEnabled: false }),
            );
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                externalSystem: ServiceProviderSystem.ITSLEARNING,
            });
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, { serviceProviderIds: [serviceProvider.id] }),
            );
            if (rolle instanceof DomainError) {
                throw rolle;
            }
            await dbiamPersonenkontextRepoInternal.save(
                DoFactory.createPersonenkontext(false, {
                    organisationId: orga.id,
                    personId: personA.id,
                    rolleId: rolle.id,
                }),
            );

            const [personen, cursor]: [Person<true>[], string | undefined] =
                await sut.findWithRolleAndNoOtherItslearningKontexteByCursor(rolle.id, 1);

            expect(personen).toHaveLength(0);
            expect(cursor).toBeUndefined();
        });
    });

    describe('findById', () => {
        describe('when found by Id', () => {
            it('should return found person', async () => {
                const nokeyclockID: SavedPersonProps = { keycloackID: '' };

                const personSaved: Person<true> = await savePerson(false, nokeyclockID);

                const foundPerson: Option<Person<true>> = await sut.findById(personSaved.id);

                expect(foundPerson).toBeInstanceOf(Person);
            });
        });

        describe('when not found by Id', () => {
            it('should return null', async () => {
                const foundPerson: Option<Person<true>> = await sut.findById(faker.string.uuid());

                expect(foundPerson).toBeNull();
            });
        });

        describe('findBy', () => {
            it('should return found persons for scope', async () => {
                await savePerson(false, { username: 'testuser1' });
                await savePerson(false, { username: 'testuser2' });

                const scope: PersonScope = new PersonScope()
                    .findBy({
                        vorname: undefined,
                        familienname: undefined,
                    })
                    .sortBy('vorname', ScopeOrder.ASC)
                    .paged(0, 2);

                const [persons, total]: Counted<Person<true>> = await sut.findBy(scope);

                expect(total).toEqual(2);
                expect(persons.at(0)).toBeInstanceOf(Person);
                expect(persons.at(1)).toBeInstanceOf(Person);
            });
        });
    });

    describe('create', () => {
        describe('When Normal Call Without Hashed Password', () => {
            describe('when person has already keycloak user', () => {
                it('should return Person', async () => {
                    usernameGeneratorService.generateUsername.mockResolvedValueOnce({
                        ok: true,
                        value: 'testusername',
                    });
                    const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                    });
                    expect(person).not.toBeInstanceOf(DomainError);
                    if (person instanceof DomainError) {
                        throw person;
                    }
                    person.keycloakUserId = faker.string.uuid();

                    const result: Person<true> | DomainError = await sut.create(person);

                    expect(result).toBeInstanceOf(Person);
                    expect(kcUserServiceMock.create).not.toHaveBeenCalled();
                });
            });

            describe('when parameters (username || password) is missing', () => {
                it('should return Domain Error', async () => {
                    usernameGeneratorService.generateUsername.mockResolvedValueOnce({
                        ok: true,
                        value: 'testusername',
                    });
                    const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                    });
                    expect(person).not.toBeInstanceOf(DomainError);
                    if (person instanceof DomainError) {
                        throw person;
                    }
                    person.username = undefined;
                    kcUserServiceMock.create.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.setPassword.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.delete.mockResolvedValueOnce({
                        ok: true,
                        value: undefined,
                    });
                    const result: Person<true> | DomainError = await sut.create(person);

                    expect(result).toBeInstanceOf(DomainError);
                    expect(kcUserServiceMock.create).not.toHaveBeenCalled();
                });
            });

            describe('when successful', () => {
                it('should return Person', async () => {
                    usernameGeneratorService.generateUsername.mockResolvedValue({ ok: true, value: 'testusername' });
                    const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                    });
                    const personWithKeycloak: Person<false> | DomainError = await Person.createNew(
                        usernameGeneratorService,
                        {
                            familienname: faker.person.lastName(),
                            vorname: faker.person.firstName(),
                        },
                    );
                    expect(person).not.toBeInstanceOf(DomainError);
                    expect(personWithKeycloak).not.toBeInstanceOf(DomainError);
                    if (person instanceof DomainError || personWithKeycloak instanceof DomainError) {
                        return;
                    }

                    personWithKeycloak.keycloakUserId = faker.string.uuid();
                    kcUserServiceMock.create.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.setPassword.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.delete.mockResolvedValueOnce({
                        ok: true,
                        value: undefined,
                    });
                    const result: Person<true> | DomainError = await sut.create(person);

                    expect(result).toBeInstanceOf(Person);
                });
            });

            describe('when creation of keyCloakUser fails', () => {
                it('should return Domain Error', async () => {
                    usernameGeneratorService.generateUsername.mockResolvedValueOnce({
                        ok: true,
                        value: 'testusername',
                    });
                    const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                    });
                    expect(person).not.toBeInstanceOf(DomainError);
                    if (person instanceof DomainError) {
                        throw person;
                    }
                    kcUserServiceMock.create.mockResolvedValueOnce({
                        ok: false,
                        error: new KeycloakClientError(''),
                    });
                    kcUserServiceMock.setPassword.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.delete.mockResolvedValueOnce({
                        ok: true,
                        value: undefined,
                    });
                    const result: Person<true> | DomainError = await sut.create(person);

                    expect(result).toBeInstanceOf(DomainError);
                    if (result instanceof DomainError) {
                        expect(kcUserServiceMock.setPassword).not.toHaveBeenCalled();
                        expect(kcUserServiceMock.delete).not.toHaveBeenCalled();
                    }
                });
            });

            describe('when resetting password of keycloak user fails', () => {
                it('should return Domain Error && delete keycloak user', async () => {
                    usernameGeneratorService.generateUsername.mockResolvedValueOnce({
                        ok: true,
                        value: 'testusername',
                    });
                    const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                    });
                    expect(person).not.toBeInstanceOf(DomainError);
                    if (person instanceof DomainError) {
                        throw person;
                    }
                    kcUserServiceMock.create.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.setPassword.mockResolvedValueOnce({
                        ok: false,
                        error: new KeycloakClientError(''),
                    });
                    kcUserServiceMock.delete.mockResolvedValueOnce({
                        ok: true,
                        value: undefined,
                    });
                    const result: Person<true> | DomainError = await sut.create(person);

                    expect(result).toBeInstanceOf(DomainError);
                    if (result instanceof DomainError) {
                        expect(kcUserServiceMock.setPassword).toHaveBeenCalled();
                        expect(kcUserServiceMock.delete).toHaveBeenCalled();
                    }
                });
            });
            describe('when creating a person with an existing personalnummer', () => {
                it('should return DuplicatePersonalnummerError and rollback the transaction', async () => {
                    const existingPersonalnummer: string = '123456';
                    usernameGeneratorService.generateUsername.mockResolvedValueOnce({
                        ok: true,
                        value: 'testusername',
                    });
                    const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                        personalnummer: existingPersonalnummer, // Setting the personalnummer to check for duplicates
                    });
                    expect(person).not.toBeInstanceOf(DomainError);
                    if (person instanceof DomainError) {
                        throw person;
                    }
                    const personEntity: PersonEntity = em.create(PersonEntity, mapAggregateToData(person));

                    personEntity.keycloakUserId = faker.string.numeric();

                    // Persist a person with the same Personalnummer as the one we send later
                    await em.persist(personEntity).flush();

                    // Act: Attempt to create the person
                    const result: Person<true> | DomainError = await sut.create(person);

                    // Assert: Ensure that a DuplicatePersonalnummerError was thrown and the transaction was rolled back
                    expect(result).toBeInstanceOf(DuplicatePersonalnummerError);
                });
            });
        });
        describe('When Migration Call With Hashed Password', () => {
            describe('when successful', () => {
                it('should return Person', async () => {
                    usernameGeneratorService.generateUsername.mockResolvedValue({ ok: true, value: 'testusername' });
                    const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                    });
                    const personWithKeycloak: Person<false> | DomainError = await Person.createNew(
                        usernameGeneratorService,
                        {
                            familienname: faker.person.lastName(),
                            vorname: faker.person.firstName(),
                        },
                    );
                    expect(person).not.toBeInstanceOf(DomainError);
                    expect(personWithKeycloak).not.toBeInstanceOf(DomainError);
                    if (person instanceof DomainError || personWithKeycloak instanceof DomainError) {
                        return;
                    }

                    personWithKeycloak.keycloakUserId = faker.string.uuid();
                    kcUserServiceMock.createWithHashedPassword.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.setPassword.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.delete.mockResolvedValueOnce({
                        ok: true,
                        value: undefined,
                    });
                    const result: Person<true> | DomainError = await sut.create(
                        person,
                        '{BCRYPT}xxxxxhqG5T3$z8v0Ou8Lmmr2mhW.lNP0DQGO9M',
                    );

                    expect(result).toBeInstanceOf(Person);
                });
            });
            describe('when username & keycloakUserId is missing', () => {
                it('should return Error', async () => {
                    usernameGeneratorService.generateUsername.mockResolvedValue({ ok: true, value: 'testusername' });
                    const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                    });
                    const personWithKeycloak: Person<false> | DomainError = await Person.createNew(
                        usernameGeneratorService,
                        {
                            familienname: faker.person.lastName(),
                            vorname: faker.person.firstName(),
                        },
                    );
                    expect(person).not.toBeInstanceOf(DomainError);
                    expect(personWithKeycloak).not.toBeInstanceOf(DomainError);
                    if (person instanceof DomainError || personWithKeycloak instanceof DomainError) {
                        return;
                    }

                    person.keycloakUserId = undefined;
                    person.username = undefined;
                    kcUserServiceMock.createWithHashedPassword.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.setPassword.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.delete.mockResolvedValueOnce({
                        ok: true,
                        value: undefined,
                    });
                    const result: Person<true> | DomainError = await sut.create(
                        person,
                        '{BCRYPT}xxxxxhqG5T3$z8v0Ou8Lmmr2mhW.lNP0DQGO9M',
                    );

                    expect(result).toBeInstanceOf(DomainError);
                });
            });
            describe('when createWithHashedPassword Keycloak Userservice fails', () => {
                it('should return Error', async () => {
                    usernameGeneratorService.generateUsername.mockResolvedValue({ ok: true, value: 'testusername' });
                    const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                    });
                    const personWithKeycloak: Person<false> | DomainError = await Person.createNew(
                        usernameGeneratorService,
                        {
                            familienname: faker.person.lastName(),
                            vorname: faker.person.firstName(),
                        },
                    );
                    expect(person).not.toBeInstanceOf(DomainError);
                    expect(personWithKeycloak).not.toBeInstanceOf(DomainError);
                    if (person instanceof DomainError || personWithKeycloak instanceof DomainError) {
                        return;
                    }

                    personWithKeycloak.keycloakUserId = faker.string.uuid();
                    kcUserServiceMock.createWithHashedPassword.mockResolvedValueOnce({
                        ok: false,
                        error: new KeycloakClientError(''),
                    });
                    kcUserServiceMock.setPassword.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.delete.mockResolvedValueOnce({
                        ok: true,
                        value: undefined,
                    });
                    const result: Person<true> | DomainError = await sut.create(
                        person,
                        '{BCRYPT}xxxxxhqG5T3$z8v0Ou8Lmmr2mhW.lNP0DQGO9M',
                    );

                    expect(result).toBeInstanceOf(DomainError);
                });
            });
        });

        describe('When an unexpected error occurs', () => {
            it('should rollback transaction and rethrow', async () => {
                usernameGeneratorService.generateUsername.mockResolvedValue({ ok: true, value: 'testusername' });
                const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                    familienname: faker.person.lastName(),
                    vorname: faker.person.firstName(),
                });
                if (person instanceof DomainError) {
                    throw person;
                }

                const dummyError: Error = new Error('Unexpected');
                kcUserServiceMock.create.mockRejectedValueOnce(dummyError);

                const promise: Promise<unknown> = sut.create(person);

                await expect(promise).rejects.toBe(dummyError);
            });
        });
    });

    describe('update', () => {
        describe('when updating personalnummer to duplicate value', () => {
            beforeEach(() => {
                vi.restoreAllMocks();
            });
            it('should return DuplicatePersonalnummerError', async () => {
                usernameGeneratorService.generateUsername.mockResolvedValueOnce({
                    ok: true,
                    value: 'testusername1',
                });

                const personalnummer: string = '54321';

                // Create first person with personalnummer
                const person1: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                    familienname: faker.person.lastName(),
                    vorname: faker.person.firstName(),
                    personalnummer: personalnummer,
                });
                expect(person1).not.toBeInstanceOf(DomainError);
                if (person1 instanceof DomainError) {
                    throw person1;
                }

                kcUserServiceMock.create.mockResolvedValueOnce({
                    ok: true,
                    value: 'something',
                });

                kcUserServiceMock.setPassword.mockResolvedValueOnce({
                    ok: true,
                    value: '',
                });

                const existingPerson1: Person<true> | DomainError = await sut.create(person1);
                expect(existingPerson1).not.toBeInstanceOf(DomainError);
                if (existingPerson1 instanceof DomainError) {
                    throw existingPerson1;
                }

                // Create second person without personalnummer
                usernameGeneratorService.generateUsername.mockResolvedValueOnce({
                    ok: true,
                    value: 'testusername2',
                });

                const person2: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                    familienname: faker.person.lastName(),
                    vorname: faker.person.firstName(),
                });
                expect(person2).not.toBeInstanceOf(DomainError);
                if (person2 instanceof DomainError) {
                    throw person2;
                }

                kcUserServiceMock.create.mockResolvedValueOnce({
                    ok: true,
                    value: 'something2',
                });

                kcUserServiceMock.setPassword.mockResolvedValueOnce({
                    ok: true,
                    value: '',
                });

                const existingPerson2: Person<true> | DomainError = await sut.create(person2);
                expect(existingPerson2).not.toBeInstanceOf(DomainError);
                if (existingPerson2 instanceof DomainError) {
                    throw existingPerson2;
                }

                // Try to update person2 with the same personalnummer as person1
                const personToUpdate: Person<true> = Person.construct(
                    existingPerson2.id,
                    existingPerson2.createdAt,
                    existingPerson2.updatedAt,
                    existingPerson2.familienname,
                    existingPerson2.vorname,
                    existingPerson2.revision,
                    existingPerson2.username,
                );

                personToUpdate.keycloakUserId = existingPerson2.keycloakUserId;
                personToUpdate.personalnummer = personalnummer; // Duplicate personalnummer

                const result: Person<true> | DomainError = await sut.update(personToUpdate);

                expect(result).toBeInstanceOf(DuplicatePersonalnummerError);
                if (result instanceof DuplicatePersonalnummerError) {
                    expect(result.message).toContain('Personalnummer 54321 already exists');
                }
            });
        });

        describe('when person exist', () => {
            describe('when only updating database attributes', () => {
                it('should return updated person', async () => {
                    usernameGeneratorService.generateUsername.mockResolvedValueOnce({
                        ok: true,
                        value: 'testusername',
                    });
                    const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                    });
                    expect(person).not.toBeInstanceOf(DomainError);
                    if (person instanceof DomainError) {
                        throw person;
                    }
                    person.username = undefined;
                    kcUserServiceMock.create.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.setPassword.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.delete.mockResolvedValueOnce({
                        ok: true,
                        value: undefined,
                    });
                    const existingPerson: Person<true> | DomainError = await sut.create(person);
                    if (existingPerson instanceof DomainError) {
                        return;
                    }
                    const personConstructed: Person<true> = Person.construct(
                        existingPerson.id,
                        faker.date.past(),
                        faker.date.recent(),
                        faker.person.lastName(),
                        faker.person.firstName(),
                        '1',
                        faker.lorem.word(),
                        faker.lorem.word(),
                        faker.string.uuid(),
                    );
                    await expect(sut.update(personConstructed)).resolves.toBeInstanceOf(Person<true>);
                    const result: Person<true> | DomainError = await sut.update(personConstructed);
                    expect(result).not.toBeInstanceOf(DomainError);
                    if (result instanceof DomainError) {
                        return;
                    }
                    expect(result.vorname).toEqual(person.vorname);
                    expect(result.familienname).toEqual(person.familienname);
                    expect(kcUserServiceMock.setPassword).not.toHaveBeenCalled();
                });
            });

            describe('when lastname has changed', () => {
                it('should trigger PersonRenamedEvent', async () => {
                    usernameGeneratorService.generateUsername.mockResolvedValueOnce({
                        ok: true,
                        value: 'testusername',
                    });
                    const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                    });
                    expect(person).not.toBeInstanceOf(DomainError);
                    if (person instanceof DomainError) {
                        throw person;
                    }
                    person.username = 'name';
                    //person.keycloakUserId = faker.string.uuid();
                    kcUserServiceMock.create.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.setPassword.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    kcUserServiceMock.delete.mockResolvedValueOnce({
                        ok: true,
                        value: undefined,
                    });
                    const existingPerson: Person<true> | DomainError = await sut.create(person);
                    if (existingPerson instanceof DomainError) {
                        return;
                    }
                    const personConstructed: Person<true> = Person.construct(
                        existingPerson.id,
                        faker.date.past(),
                        faker.date.recent(),
                        faker.person.lastName(),
                        person.vorname,
                        '1',
                        faker.lorem.word(),
                        faker.lorem.word(),
                        faker.string.uuid(),
                    );
                    await expect(sut.update(personConstructed)).resolves.toBeInstanceOf(Person<true>);
                    const result: Person<true> | DomainError = await sut.update(personConstructed);
                    expect(result).not.toBeInstanceOf(DomainError);
                    if (result instanceof DomainError) {
                        return;
                    }
                    expect(eventServiceMock.publish).toHaveBeenCalledWith(
                        expect.any(PersonRenamedEvent),
                        expect.any(KafkaPersonRenamedEvent),
                    );
                    expect(result.vorname).toEqual(person.vorname);
                    expect(result.familienname).not.toEqual(person.familienname);
                });
            });

            describe('when updating keycloak password', () => {
                describe('when keycloak operation succeeds', () => {
                    it('should return updated person', async () => {
                        usernameGeneratorService.generateUsername.mockResolvedValueOnce({
                            ok: true,
                            value: 'testusername',
                        });
                        const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                            familienname: faker.person.lastName(),
                            vorname: faker.person.firstName(),
                        });
                        expect(person).not.toBeInstanceOf(DomainError);
                        if (person instanceof DomainError) {
                            throw person;
                        }
                        person.username = undefined;
                        kcUserServiceMock.create.mockResolvedValueOnce({
                            ok: true,
                            value: '',
                        });
                        kcUserServiceMock.setPassword.mockResolvedValueOnce({
                            ok: true,
                            value: '',
                        });
                        kcUserServiceMock.delete.mockResolvedValueOnce({
                            ok: true,
                            value: undefined,
                        });
                        const existingPerson: Person<true> | DomainError = await sut.create(person);
                        if (existingPerson instanceof DomainError) {
                            return;
                        }
                        const personConstructed: Person<true> = Person.construct(
                            existingPerson.id,
                            faker.date.past(),
                            faker.date.recent(),
                            faker.person.lastName(),
                            faker.person.firstName(),
                            '1',
                            faker.lorem.word(),
                            faker.lorem.word(),
                            faker.string.uuid(),
                        );
                        person.resetPassword();

                        kcUserServiceMock.setPassword.mockResolvedValue({
                            ok: true,
                            value: '',
                        });

                        await expect(sut.update(personConstructed)).resolves.toBeInstanceOf(Person<true>);
                        const result: Person<true> | DomainError = await sut.update(personConstructed);
                        expect(result).not.toBeInstanceOf(DomainError);
                        if (result instanceof DomainError) {
                            return;
                        }
                        expect(result.vorname).toEqual(person.vorname);
                        expect(result.familienname).toEqual(person.familienname);
                        expect(kcUserServiceMock.setPassword).toHaveBeenCalled();
                    });
                });
                describe('when keycloak operation fails', () => {
                    it('should return updated person', async () => {
                        const PersonSaved: Person<true> = await savePerson();
                        const person: Person<true> = Person.construct(
                            PersonSaved.id,
                            faker.date.past(),
                            faker.date.recent(),
                            faker.person.lastName(),
                            faker.person.firstName(),
                            '1',
                            faker.lorem.word(),
                            faker.lorem.word(),
                            faker.string.uuid(),
                        );
                        person.resetPassword();

                        kcUserServiceMock.setPassword.mockResolvedValue({
                            ok: false,
                            error: new KeycloakClientError(''),
                        });

                        await expect(sut.update(person)).resolves.toBeInstanceOf(DomainError);
                        const result: Person<true> | DomainError = await sut.update(person);
                        expect(result).not.toBeInstanceOf(Person<true>);
                        if (result instanceof Person) {
                            return;
                        }
                        expect(kcUserServiceMock.setPassword).toHaveBeenCalled();
                    });
                });
            });
        });
        describe('when person does not exist', () => {
            it('should fail', async () => {
                const person: Person<true> = Person.construct(
                    faker.string.uuid(),
                    faker.date.past(),
                    faker.date.recent(),
                    faker.person.lastName(),
                    faker.person.firstName(),
                    '1',
                    faker.lorem.word(),
                    faker.lorem.word(),
                    faker.string.uuid(),
                );
                await expect(sut.update(person)).rejects.toBeDefined();
            });
        });
        describe('when username is defined', () => {
            it('should use the existing username if the person has not been renamed', async () => {
                const existingPerson: Person<true> = await savePerson();
                kcUserServiceMock.setPassword.mockResolvedValueOnce({
                    ok: true,
                    value: 'mockedPassword',
                });
                const result: Person<true> | DomainError = await sut.update(existingPerson);

                expect(result).toBeInstanceOf(Person);
                if (result instanceof Person) {
                    expect(result.username).toEqual(existingPerson.username);
                }
            });
        });
        describe('when username is undefined', () => {
            beforeEach(() => {
                vi.restoreAllMocks();
            });

            it('should return an error if the username generator fails', async () => {
                usernameGeneratorService.generateUsername.mockResolvedValue({ ok: true, value: 'testusername' });
                const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                    familienname: 'lastname',
                    vorname: 'firstname',
                });
                expect(person).not.toBeInstanceOf(DomainError);
                if (person instanceof DomainError) {
                    throw person;
                }
                kcUserServiceMock.create.mockResolvedValueOnce({
                    ok: true,
                    value: 'something',
                });
                kcUserServiceMock.setPassword.mockResolvedValueOnce({
                    ok: true,
                    value: '',
                });
                kcUserServiceMock.delete.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });
                const existingPerson: Person<true> | DomainError = await sut.create(person);
                if (existingPerson instanceof DomainError) {
                    return;
                }
                const firstname: string = faker.person.firstName();
                const lastname: string = faker.person.lastName();
                const personConstructed: Person<true> = Person.construct(
                    existingPerson.id,
                    faker.date.past(),
                    faker.date.recent(),
                    lastname,
                    firstname,
                    '1',
                    faker.lorem.word(),
                    faker.lorem.word(),
                    faker.string.uuid(),
                );
                usernameGeneratorService.generateUsername.mockResolvedValueOnce({
                    ok: false,
                    error: new InvalidCharacterSetError('name.vorname', 'DIN-91379A'),
                });
                vi.spyOn(sut, 'getUsername').mockReturnValueOnce(undefined);

                const result: Person<true> | DomainError = await sut.update(personConstructed);
                expect(result).toBeInstanceOf(DomainError);
                expect(usernameGeneratorService.generateUsername).toHaveBeenCalledWith(firstname, lastname);
            });

            it('should generate a new username if the person has been renamed', async () => {
                usernameGeneratorService.generateUsername.mockResolvedValue({ ok: true, value: 'testusername' });
                const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                    familienname: 'lastname',
                    vorname: 'firstname',
                });
                expect(person).not.toBeInstanceOf(DomainError);
                if (person instanceof DomainError) {
                    throw person;
                }
                kcUserServiceMock.create.mockResolvedValueOnce({
                    ok: true,
                    value: 'something',
                });
                kcUserServiceMock.setPassword.mockResolvedValueOnce({
                    ok: true,
                    value: '',
                });
                kcUserServiceMock.delete.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });
                const existingPerson: Person<true> | DomainError = await sut.create(person);
                if (existingPerson instanceof DomainError) {
                    return;
                }
                const firstname: string = faker.person.firstName();
                const lastname: string = faker.person.lastName();
                const personConstructed: Person<true> = Person.construct(
                    existingPerson.id,
                    faker.date.past(),
                    faker.date.recent(),
                    lastname,
                    firstname,
                    '1',
                    'newtestusername',
                    faker.lorem.word(),
                    faker.lorem.word(),
                );
                usernameGeneratorService.generateUsername.mockResolvedValue({ ok: true, value: 'newtestusername' });
                vi.spyOn(sut, 'getUsername').mockReturnValueOnce(undefined);
                const result: Person<true> | DomainError = await sut.update(personConstructed);
                expect(result).toBeInstanceOf(Person);
                if (result instanceof Person) {
                    expect(result.username).toEqual('newtestusername');
                }
                expect(usernameGeneratorService.generateUsername).toHaveBeenCalledWith(firstname, lastname);
            });
        });
    });

    describe('getOxUserId', () => {
        let personEntity: PersonEntity;

        beforeEach(() => {
            personEntity = em.create(
                PersonEntity,
                mapAggregateToData(DoFactory.createPerson(true, { keycloakUserId: faker.string.uuid() })),
            );
            personEntity.emailAddresses = new Collection<EmailAddressEntity>(personEntity);
        });

        describe('when enabled emailAddress is in collection', () => {
            it('should return address of (first found) enabled address', () => {
                const emailAddressEntity: EmailAddressEntity = getFakeEmailAddress();

                personEntity.emailAddresses.add(emailAddressEntity);

                const result: string | undefined = getOxUserId(personEntity);

                expect(result).toBeDefined();
            });
        });

        describe('when no enabled but an disabled emailAddress is in collection', () => {
            it('should return address of (first found) disabled address', () => {
                const disabledEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(EmailAddressStatus.DISABLED);
                const deletedLdapEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(
                    EmailAddressStatus.DELETED_LDAP,
                );
                const deletedOxEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(
                    EmailAddressStatus.DELETED_OX,
                );
                const deletedEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(EmailAddressStatus.DELETED);
                const failedEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(EmailAddressStatus.FAILED);
                const requestedEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(
                    EmailAddressStatus.REQUESTED,
                );

                personEntity.emailAddresses.add(disabledEmailAddressEntity);
                personEntity.emailAddresses.add(deletedLdapEmailAddressEntity);
                personEntity.emailAddresses.add(deletedOxEmailAddressEntity);
                personEntity.emailAddresses.add(deletedEmailAddressEntity);
                personEntity.emailAddresses.add(failedEmailAddressEntity);
                personEntity.emailAddresses.add(requestedEmailAddressEntity);

                const result: string | undefined = getOxUserId(personEntity);

                expect(result).toStrictEqual(disabledEmailAddressEntity.oxUserId);
            });
        });

        describe('when emailAddress with DELETED_OX, DEELETED_LDAP or DELETED is highest status in collection', () => {
            it('should return address of emailAddress with status DELETED_OX', () => {
                const deletedLdapEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(
                    EmailAddressStatus.DELETED_LDAP,
                );
                const deletedOxEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(
                    EmailAddressStatus.DELETED_OX,
                );
                const deletedEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(EmailAddressStatus.DELETED);
                const failedEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(EmailAddressStatus.FAILED);
                const requestedEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(
                    EmailAddressStatus.REQUESTED,
                );

                // opposite order is intentionally, implicitly checking order by date
                personEntity.emailAddresses.add(requestedEmailAddressEntity);
                personEntity.emailAddresses.add(failedEmailAddressEntity);
                personEntity.emailAddresses.add(deletedLdapEmailAddressEntity);
                personEntity.emailAddresses.add(deletedOxEmailAddressEntity);
                personEntity.emailAddresses.add(deletedEmailAddressEntity);

                const result: string | undefined = getOxUserId(personEntity);

                expect(result).toStrictEqual(deletedLdapEmailAddressEntity.oxUserId);
            });
        });

        describe('when emailAddress with FAILED is highest status in collection', () => {
            it('should return address of emailAddress with status FAILED', () => {
                const failedEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(EmailAddressStatus.FAILED);
                const requestedEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(
                    EmailAddressStatus.REQUESTED,
                );

                // opposite order is intentionally, implicitly checking order by date
                personEntity.emailAddresses.add(requestedEmailAddressEntity);
                personEntity.emailAddresses.add(failedEmailAddressEntity);

                const result: string | undefined = getOxUserId(personEntity);

                expect(result).toStrictEqual(failedEmailAddressEntity.oxUserId);
            });
        });

        describe('when emailAddress with REQUESTED is highest status in collection', () => {
            it('should return address of emailAddress with status REQUESTED', () => {
                const requestedEmailAddressEntity: EmailAddressEntity = getFakeEmailAddress(
                    EmailAddressStatus.REQUESTED,
                );

                personEntity.emailAddresses.add(requestedEmailAddressEntity);

                const result: string | undefined = getOxUserId(personEntity);

                expect(result).toStrictEqual(requestedEmailAddressEntity.oxUserId);
            });
        });

        /* describe('when only failed emailAddresses are in collection', () => {
            it('should return undefined', () => {
                const emailAddressEntity: EmailAddressEntity = getFakeEmailAddress(EmailAddressStatus.FAILED);
                personEntity.emailAddresses.add(emailAddressEntity);

                const result: string | undefined = getOxUserId(personEntity);

                expect(result).toBeUndefined();
            });
        });*/

        describe('when NO emailAddress at all is found in collection', () => {
            it('should return undefined', () => {
                const result: string | undefined = getOxUserId(personEntity);

                expect(result).toBeUndefined();
            });
        });
    });

    describe('mapAggregateToData', () => {
        it('should return Person RequiredEntityData', () => {
            const person: Person<true> = Person.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.person.lastName(),
                faker.person.firstName(),
                '1',
                faker.lorem.word(),
                faker.lorem.word(),
                faker.string.uuid(),
            );

            person.externalIds.LDAP = faker.string.uuid();

            const expectedProperties: string[] = [
                'keycloakUserId',
                'username',
                'mandant',
                'stammorganisation',
                'familienname',
                'vorname',
                'dataProvider',
                'revision',
                'istTechnisch',
            ];

            const result: RequiredEntityData<PersonEntity> = mapAggregateToData(person);

            expectedProperties.forEach((prop: string) => {
                expect(result).toHaveProperty(prop);
            });

            expect(result.externalIds).toHaveLength(1);
        });
    });

    describe('mapEntityToAggregate', () => {
        it('should return New Aggregate', () => {
            const personEntity: PersonEntity = em.create(
                PersonEntity,
                mapAggregateToData(DoFactory.createPerson(true, { keycloakUserId: faker.string.uuid() })),
            );
            personEntity.externalIds.add(
                em.create(PersonExternalIdMappingEntity, {
                    externalId: faker.string.uuid(),
                    type: PersonExternalIdType.LDAP,
                }),
            );
            const person: Person<true> = mapEntityToAggregate(personEntity);

            expect(person).toBeInstanceOf(Person);
            expect(person.externalIds.LDAP).toBeDefined();
        });
    });

    describe('mapEntityToAggregateInplace', () => {
        it('should return Updated Aggregate', () => {
            const person: Person<true> = Person.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.person.lastName(),
                faker.person.firstName(),
                '1',
                faker.lorem.word(),
                faker.lorem.word(),
                faker.string.uuid(),
            );

            const personEntity: PersonEntity = createMock<PersonEntity>(PersonEntity);
            personEntity.keycloakUserId = faker.string.uuid();
            const personAfterUpdate: Person<true> = mapEntityToAggregateInplace(personEntity, person);

            expect(personAfterUpdate).toBeInstanceOf(Person);
            expect(personAfterUpdate.vorname).toEqual(person.vorname);
            expect(personAfterUpdate.familienname).toEqual(person.familienname);
        });
    });

    describe('findByPrimaryEmailAddress', () => {
        let person: Person<true>;
        let personEntity: PersonEntity;
        beforeEach(async () => {
            person = DoFactory.createPerson(true);
            personEntity = new PersonEntity();
            personEntity = personEntity.assign(mapAggregateToData(person));
            await em.persist(personEntity).flush();
            person.id = personEntity.id;
        });

        it.each([[EmailAddressStatus.ENABLED], [EmailAddressStatus.DISABLED]])(
            'should return persons with matching email addresses in status %s',
            async (status: EmailAddressStatus) => {
                const emailAddressEntities: EmailAddressEntity[] = ['test@example.com', 'test-other@example.com'].map(
                    (email: string) => {
                        const emailAddressEntity: EmailAddressEntity = new EmailAddressEntity();
                        emailAddressEntity.address = email;
                        emailAddressEntity.status = status;
                        emailAddressEntity.personId = ref(PersonEntity, personEntity.id);
                        return emailAddressEntity;
                    },
                );
                await em.persist(emailAddressEntities).flush();
                personEntity.emailAddresses.add(emailAddressEntities);
                await em.persist(personEntity).flush();

                const result: Person<true>[] = await sut.findByPrimaryEmailAddress('test@example.com');

                expect(result).toHaveLength(1);
                expect(result[0]?.id).toBe(person.id);
            },
        );

        it('should not return person with different primary email address', async () => {
            const emailAddressEntities: EmailAddressEntity[] = [
                EmailAddressStatus.DISABLED,
                EmailAddressStatus.ENABLED,
            ].map((status: EmailAddressStatus) => {
                const emailAddressEntity: EmailAddressEntity = new EmailAddressEntity();
                emailAddressEntity.address = faker.internet.email();
                emailAddressEntity.status = status;
                emailAddressEntity.personId = ref(PersonEntity, personEntity.id);
                return emailAddressEntity;
            });
            await em.persist(emailAddressEntities).flush();
            personEntity.emailAddresses.add(emailAddressEntities);
            await em.persist(personEntity).flush();

            const email: string = emailAddressEntities.find(
                (e: EmailAddressEntity) => e.status === EmailAddressStatus.DISABLED,
            )!.address;
            expect(email).toBeDefined();

            const result: Person<true>[] = await sut.findByPrimaryEmailAddress(email);

            expect(result).toHaveLength(0);
        });

        it('should return empty list if no enabled/disabled email found', async () => {
            const emailAddressEntities: EmailAddressEntity[] = [
                EmailAddressStatus.DELETED,
                EmailAddressStatus.DELETED_LDAP,
                EmailAddressStatus.DELETED_OX,
                EmailAddressStatus.FAILED,
                EmailAddressStatus.REQUESTED,
            ].map((status: EmailAddressStatus) => {
                const emailAddressEntity: EmailAddressEntity = new EmailAddressEntity();
                emailAddressEntity.address = `test-${status}@example.com`;
                emailAddressEntity.status = status;
                emailAddressEntity.personId = ref(PersonEntity, personEntity.id);
                return emailAddressEntity;
            });
            await em.persist(emailAddressEntities).flush();
            personEntity.emailAddresses.add(emailAddressEntities);
            await em.persist(personEntity).flush();

            const result: Person<true>[] = await sut.findByPrimaryEmailAddress('test@example.com');

            expect(result).toHaveLength(0);
        });

        it('should return empty list if no matching email found', async () => {
            const result: Person<true>[] = await sut.findByPrimaryEmailAddress('nonexistent@example.com');
            expect(result).toHaveLength(0);
        });
    });

    describe('findByPersonalnummer', () => {
        it('should return persons with matching personalnummer', async () => {
            const personalnummer: string = faker.string.alphanumeric(5);
            const person1: Person<true> = DoFactory.createPerson(true);
            person1.personalnummer = personalnummer;
            const personEntity: PersonEntity = new PersonEntity();
            await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
            person1.id = personEntity.id;

            const result: Person<true>[] = await sut.findByPersonalnummer(personalnummer);

            expect(result).toHaveLength(1);
        });

        it('should return empty list if no person matches personalnummer', async () => {
            const result: Person<true>[] = await sut.findByPersonalnummer('0000000');
            expect(result).toHaveLength(0);
        });
    });

    describe('findByUsername', () => {
        it('should return persons with matching username (username)', async () => {
            const username: string = faker.internet.username();
            const person1: Person<true> = DoFactory.createPerson(true);
            person1.username = username;
            const personEntity: PersonEntity = new PersonEntity();
            await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
            person1.id = personEntity.id;

            const result: Person<true>[] = await sut.findByUsername(username);

            expect(result).toHaveLength(1);
        });

        it('should return empty list if no match for username (username)', async () => {
            const result: Person<true>[] = await sut.findByUsername('not-existent-username');
            expect(result).toHaveLength(0);
        });
    });

    describe('findByFullName', () => {
        it('should return persons matching both vorname and familienname', async () => {
            const vorname: string = faker.person.firstName();
            const familienname: string = faker.person.lastName();
            const person1: Person<true> = DoFactory.createPerson(true);
            person1.vorname = vorname;
            person1.familienname = familienname;
            const personEntity: PersonEntity = new PersonEntity();
            await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
            person1.id = personEntity.id;

            const result: Person<true>[] = await sut.findByFullName(vorname, familienname);

            expect(result).toHaveLength(1);
            expect(result[0]?.vorname).toBe(vorname);
            expect(result[0]?.familienname).toBe(familienname);
        });

        it('should return empty list if no match for vorname and familienname', async () => {
            const result: Person<true>[] = await sut.findByFullName('Bruce', 'Wayne');
            expect(result).toHaveLength(0);
        });
    });

    describe('getPersonIfAllowed', () => {
        describe('when person is found on any same organisations like the affected person', () => {
            it('should return person', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;

                const organisation: OrganisationEntity = await createAndPersistOrganisation(
                    em,
                    undefined,
                    OrganisationsTyp.SCHULE,
                );

                const rolleData: RequiredEntityData<RolleEntity> = {
                    name: 'Testrolle',
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.ORGADMIN,
                    istTechnisch: false,
                };
                const rolleEntity: RolleEntity = em.create(RolleEntity, rolleData);
                await em.persist(rolleEntity).flush();

                const personenkontextData: RequiredEntityData<PersonenkontextEntity> = {
                    organisationId: organisation.id,
                    personId: person1.id,
                    rolleId: rolleEntity.id,
                };
                const personenkontextEntity: PersonenkontextEntity = em.create(
                    PersonenkontextEntity,
                    personenkontextData,
                );
                await em.persist(personenkontextEntity).flush();

                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                    all: false,
                    orgaIds: [organisation.id],
                });

                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId!,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                const result: Result<Person<true>> = await sut.getPersonIfAllowed(person1.id, personPermissionsMock);

                expect(result.ok).toBeTruthy();
            });
            it('should return person with fallback keycloak info', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                    all: true,
                });
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;
                person1.userLock = [
                    {
                        person: person1.id,
                        locked_by: '',
                        locked_until: new Date(),
                        locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
                        created_at: new Date(),
                    },
                ];
                person1.isLocked = false;

                kcUserServiceMock.findById.mockResolvedValue({
                    ok: false,
                    error: new KeycloakClientError(''),
                });

                const result: Result<Person<true>> = await sut.getPersonIfAllowed(person1.id, personPermissionsMock);

                expect(result.ok).toBeTruthy();
            });
        });
        describe('when user has permission on root organisation', () => {
            it('should return person', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);

                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId!,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                const result: Result<Person<true>> = await sut.getPersonIfAllowed(
                    personEntity.id,
                    personPermissionsMock,
                );

                expect(result.ok).toBeTruthy();
            });
        });

        it('should return DomainError when user is technical', async () => {
            const person1: Person<true> = DoFactory.createPerson(true);
            person1.istTechnisch = true;
            const personEntity: PersonEntity = new PersonEntity();
            await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
            person1.id = personEntity.id;

            const organisation: OrganisationEntity = await createAndPersistOrganisation(
                em,
                undefined,
                OrganisationsTyp.SCHULE,
            );

            const rolleData: RequiredEntityData<RolleEntity> = {
                name: 'Testrolle',
                administeredBySchulstrukturknoten: organisation.id,
                rollenart: RollenArt.ORGADMIN,
                istTechnisch: true,
            };
            const rolleEntity: RolleEntity = em.create(RolleEntity, rolleData);
            await em.persist(rolleEntity).flush();

            const personenkontextData: RequiredEntityData<PersonenkontextEntity> = {
                organisationId: organisation.id,
                personId: person1.id,
                rolleId: rolleEntity.id,
            };
            const personenkontextEntity: PersonenkontextEntity = em.create(PersonenkontextEntity, personenkontextData);
            await em.persist(personenkontextEntity).flush();

            personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [organisation.id],
            });

            kcUserServiceMock.findById.mockResolvedValue({
                ok: true,
                value: {
                    id: person1.keycloakUserId!,
                    username: person1.username ?? '',
                    enabled: true,
                    email: faker.internet.email(),
                    createdDate: new Date(),
                    externalSystemIDs: {},
                },
            });

            const result: Result<Person<true>> = await sut.getPersonIfAllowed(person1.id, personPermissionsMock);

            // check that the result is a DomainError
            expect(result.ok).toBeFalsy();
            if (result.ok === false) {
                expect(result.error).toBeInstanceOf(DomainError);
            }
        });
    });

    describe('getPersonIfAllowedOrRequesterIsPerson', () => {
        describe('when requester id equals personId and can be found', () => {
            it('should return person and not call getPersonIfAllowed', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;

                //mock requester is same person
                personPermissionsMock.personFields.id = person1.id;

                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId!,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                const result: Result<Person<true>> = await sut.getPersonIfAllowedOrRequesterIsPerson(
                    person1.id,
                    personPermissionsMock,
                );

                expect(result.ok).toBeTruthy();
                expect(personPermissionsMock.getOrgIdsWithSystemrecht).toHaveBeenCalledTimes(0);
            });
        });

        describe('when requester id equals personId and CANNOT be found', () => {
            it('should return person and not call getPersonIfAllowed', async () => {
                const nonExistingPersonId: string = faker.string.uuid();
                //mock requester is same person
                personPermissionsMock.personFields.id = nonExistingPersonId;

                const result: Result<Person<true>> = await sut.getPersonIfAllowedOrRequesterIsPerson(
                    nonExistingPersonId,
                    personPermissionsMock,
                );

                expect(result.ok).toBeFalsy();
                expect(personPermissionsMock.getOrgIdsWithSystemrecht).toHaveBeenCalledTimes(0);
            });
        });

        describe('when requester id is NOT equal personId', () => {
            it('should call getPersonIfAllowed', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;

                const organisation: OrganisationEntity = await createAndPersistOrganisation(
                    em,
                    undefined,
                    OrganisationsTyp.SCHULE,
                );

                const rolleData: RequiredEntityData<RolleEntity> = {
                    name: 'Testrolle',
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.ORGADMIN,
                    istTechnisch: false,
                };
                const rolleEntity: RolleEntity = em.create(RolleEntity, rolleData);
                await em.persist(rolleEntity).flush();

                const personenkontextData: RequiredEntityData<PersonenkontextEntity> = {
                    organisationId: organisation.id,
                    personId: person1.id,
                    rolleId: rolleEntity.id,
                };
                const personenkontextEntity: PersonenkontextEntity = em.create(
                    PersonenkontextEntity,
                    personenkontextData,
                );
                await em.persist(personenkontextEntity).flush();

                //mock explicitly that requestor is another person
                personPermissionsMock.personFields.id = faker.string.uuid();

                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                    all: false,
                    orgaIds: [organisation.id],
                });

                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId!,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                const result: Result<Person<true>> = await sut.getPersonIfAllowedOrRequesterIsPerson(
                    person1.id,
                    personPermissionsMock,
                );

                expect(result.ok).toBeTruthy();
                expect(personPermissionsMock.getOrgIdsWithSystemrecht).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('deletePerson', () => {
        describe('Delete the person and all kontexte', () => {
            afterEach(() => {
                personPermissionsMock.getOrgIdsWithSystemrecht.mockReset();
            });

            it('should delete the person as root', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;
                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId!,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                const removedPersonenkontexts: PersonenkontextEventKontextData[] = [];
                const result: Result<void, DomainError> = await sut.deletePerson(
                    person1.id,
                    personPermissionsMock,
                    removedPersonenkontexts,
                );
                expect(result.ok).toBeTruthy();
                expect(await em.count(PersonEntity, { id: person1.id })).toBe(0);
            });

            it('should delete the person as admin of organisation', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;
                const organisation: OrganisationEntity = await createAndPersistOrganisation(
                    em,
                    undefined,
                    OrganisationsTyp.SCHULE,
                );

                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId!,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                const rolleData: RequiredEntityData<RolleEntity> = {
                    name: 'Testrolle',
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.ORGADMIN,
                    istTechnisch: false,
                };

                const rolleEntity: RolleEntity = em.create(RolleEntity, rolleData);
                await em.persist(rolleEntity).flush();

                const personenkontextData: RequiredEntityData<PersonenkontextEntity> = {
                    organisationId: organisation.id,
                    personId: person1.id,
                    rolleId: rolleEntity.id,
                };
                const personenkontextEntity: PersonenkontextEntity = em.create(
                    PersonenkontextEntity,
                    personenkontextData,
                );
                await em.persist(personenkontextEntity).flush();
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                    all: false,
                    orgaIds: [organisation.id],
                });

                const removedPersonenkontexts: PersonenkontextEventKontextData[] = [];
                const result: Result<void, DomainError> = await sut.deletePerson(
                    person1.id,
                    personPermissionsMock,
                    removedPersonenkontexts,
                );
                expect(result.ok).toBeTruthy();

                expect(await em.count(PersonEntity, { id: person1.id })).toBe(0);
                expect(await em.count(PersonenkontextEntity, { personId: person1.id })).toBe(0);
            });

            describe('Delete the person and all kontexte and trigger event to delete email', () => {
                it('should delete the person and trigger PersonDeletedEvent', async () => {
                    const person: Person<true> = DoFactory.createPerson(true);
                    const personEntity: PersonEntity = new PersonEntity();
                    await em.persist(personEntity.assign(mapAggregateToData(person))).flush();
                    person.id = personEntity.id;
                    personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

                    await em.persist(personEntity).flush();

                    const emailAddress: EmailAddressEntity = new EmailAddressEntity();
                    emailAddress.address = faker.internet.email();
                    emailAddress.personId = ref(PersonEntity, person.id);
                    emailAddress.status = EmailAddressStatus.ENABLED;

                    const pp: EmailAddressEntity = em.create(EmailAddressEntity, emailAddress);
                    await em.persist(pp).flush();

                    personEntity.emailAddresses.add(emailAddress);
                    await em.persist(personEntity).flush();
                    kcUserServiceMock.findById.mockResolvedValue({
                        ok: true,
                        value: {
                            id: person.keycloakUserId!,
                            username: person.username ?? '',
                            enabled: true,
                            email: faker.internet.email(),
                            createdDate: new Date(),
                            externalSystemIDs: {},
                        },
                    });

                    emailResolverServiceMock.getPrimaryActiveEmailForPerson.mockResolvedValue(emailAddress.address);

                    const removedPersonenkontexts: PersonenkontextEventKontextData[] = [];
                    const result: Result<void, DomainError> = await sut.deletePerson(
                        person.id,
                        personPermissionsMock,
                        removedPersonenkontexts,
                    );

                    expect(result.ok).toBeTruthy();
                    expect(emailResolverServiceMock.getPrimaryActiveEmailForPerson).toHaveBeenCalled();
                    expect(eventServiceMock.publish).toHaveBeenNthCalledWith(
                        2,
                        expect.any(PersonDeletedEvent),
                        expect.any(KafkaPersonDeletedEvent),
                    );

                    expect(await em.count(PersonEntity, { id: person.id })).toBe(0);

                    const callArgs: [] | [legacyEvent: BaseEvent, kafkaEvent?: KafkaEvent | undefined] =
                        eventServiceMock.publish.mock.calls[1] ?? [];
                    const personDeletedEvent: PersonDeletedEvent | undefined = callArgs[0] as
                        | PersonDeletedEvent
                        | undefined;
                    const kafkaPersonDeletedEvent: KafkaPersonDeletedEvent | undefined = callArgs[1] as
                        | KafkaPersonDeletedEvent
                        | undefined;

                    expect(personDeletedEvent?.emailAddress).toBe(emailAddress.address);
                    expect(kafkaPersonDeletedEvent?.emailAddress).toBe(emailAddress.address);
                });
            });

            it('should not delete the person because of unsufficient permissions to find the person', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });

                await em.persist(em.create(PersonEntity, mapAggregateToData(person1))).flush();

                const removedPersonenkontexts: PersonenkontextEventKontextData[] = [];
                const result: Result<void, DomainError> = await sut.deletePerson(
                    person1.id,
                    personPermissionsMock,
                    removedPersonenkontexts,
                );

                expect(result.ok).toBeFalsy();
            });
            it('should not delete the person because of unsufficient permissions to delete the person', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                personPermissionsMock.getOrgIdsWithSystemrecht.mockImplementation(
                    (systemRechte: RollenSystemRecht[]) => {
                        if (systemRechte.length === 1 && systemRechte[0] === RollenSystemRecht.PERSONEN_VERWALTEN) {
                            return Promise.resolve({ all: true });
                        }
                        return Promise.resolve({ all: false, orgaIds: [] });
                    },
                );
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;
                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId!,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                const removedPersonenkontexts: PersonenkontextEventKontextData[] = [];
                const result: Result<void, DomainError> = await sut.deletePerson(
                    person1.id,
                    personPermissionsMock,
                    removedPersonenkontexts,
                );

                expect(result.ok).toBeFalsy();
                if (!result.ok) {
                    expect(result.error).toBeInstanceOf(EntityCouldNotBeDeleted);
                }
            });
            it('should not delete the person because it has no keycloakId', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                person1.keycloakUserId = '';
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;

                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                await sut.getPersonIfAllowed(person1.id, personPermissionsMock);
                const personGetAllowed: Result<Person<true>> = await sut.getPersonIfAllowed(
                    person1.id,
                    personPermissionsMock,
                );

                if (!personGetAllowed.ok) {
                    throw new EntityNotFoundError('Person', person1.id);
                }

                const removedPersonenkontexts: PersonenkontextEventKontextData[] = [];
                await expect(
                    sut.deletePerson(personGetAllowed.value.id, personPermissionsMock, removedPersonenkontexts),
                ).rejects.toThrow(PersonHasNoKeycloakId);
            });
        });
    });

    describe('deletePersonAfterDeadlineExceeded', () => {
        describe('Delete the person and all kontexte', () => {
            afterEach(() => {
                personPermissionsMock.getOrgIdsWithSystemrecht.mockReset();
            });

            it('should delete the person as root', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;
                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId!,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                const removedPersonenkontexts: PersonenkontextEventKontextData[] = [];
                const result: Result<void, DomainError> = await sut.deletePersonAfterDeadlineExceeded(
                    person1.id,
                    personPermissionsMock,
                    removedPersonenkontexts,
                );
                expect(result.ok).toBeTruthy();

                expect(await em.count(PersonEntity, { id: person1.id })).toBe(0);
            });

            it('should delete the person as admin of organisation', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;
                const organisation: OrganisationEntity = await createAndPersistOrganisation(
                    em,
                    undefined,
                    OrganisationsTyp.SCHULE,
                );

                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId!,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                const rolleData: RequiredEntityData<RolleEntity> = {
                    name: 'Testrolle',
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.ORGADMIN,
                    istTechnisch: false,
                };

                const rolleEntity: RolleEntity = em.create(RolleEntity, rolleData);
                await em.persist(rolleEntity).flush();

                const personenkontextData: RequiredEntityData<PersonenkontextEntity> = {
                    organisationId: organisation.id,
                    personId: person1.id,
                    rolleId: rolleEntity.id,
                };
                const personenkontextEntity: PersonenkontextEntity = em.create(
                    PersonenkontextEntity,
                    personenkontextData,
                );
                await em.persist(personenkontextEntity).flush();
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                    all: false,
                    orgaIds: [organisation.id],
                });

                const removedPersonenkontexts: PersonenkontextEventKontextData[] = [];
                const result: Result<void, DomainError> = await sut.deletePersonAfterDeadlineExceeded(
                    person1.id,
                    personPermissionsMock,
                    removedPersonenkontexts,
                );
                expect(result.ok).toBeTruthy();

                expect(await em.count(PersonEntity, { id: person1.id })).toBe(0);
                expect(await em.count(PersonenkontextEntity, { personId: person1.id })).toBe(0);
            });

            it('should delete the person as admin of organisation and publish events when username and oxUserId are defined', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                const personEntity: PersonEntity = new PersonEntity();
                person1.username = faker.internet.username();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;

                const emailAddress: EmailAddressEntity = new EmailAddressEntity();
                const oxUserId: OXUserID = faker.string.numeric();
                emailAddress.address = faker.internet.email();
                emailAddress.personId = ref(PersonEntity, personEntity.id);
                emailAddress.status = EmailAddressStatus.ENABLED;
                emailAddress.oxUserId = oxUserId;

                const pp: EmailAddressEntity = em.create(EmailAddressEntity, emailAddress);
                await em.persist(pp).flush();

                personEntity.emailAddresses.add(emailAddress);
                await em.persist(personEntity).flush();

                const organisation: OrganisationEntity = await createAndPersistOrganisation(
                    em,
                    undefined,
                    OrganisationsTyp.SCHULE,
                );

                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId!,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                const rolleData: RequiredEntityData<RolleEntity> = {
                    name: 'Testrolle',
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.ORGADMIN,
                    istTechnisch: false,
                };

                const rolleEntity: RolleEntity = em.create(RolleEntity, rolleData);
                await em.persist(rolleEntity).flush();

                const personenkontextData: RequiredEntityData<PersonenkontextEntity> = {
                    organisationId: organisation.id,
                    personId: person1.id,
                    rolleId: rolleEntity.id,
                };
                const personenkontextEntity: PersonenkontextEntity = em.create(
                    PersonenkontextEntity,
                    personenkontextData,
                );
                await em.persist(personenkontextEntity).flush();
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                    all: false,
                    orgaIds: [organisation.id],
                });

                const removedPersonenkontexts: PersonenkontextEventKontextData[] = [];
                const result: Result<void, DomainError> = await sut.deletePersonAfterDeadlineExceeded(
                    person1.id,
                    personPermissionsMock,
                    removedPersonenkontexts,
                );
                expect(result.ok).toBeTruthy();
                expect(eventServiceMock.publish).toHaveBeenCalledWith(
                    expect.objectContaining({
                        personId: person1.id,
                        username: person1.username,
                        oxUserId: oxUserId,
                    }),
                    expect.objectContaining({
                        personId: person1.id,
                        username: person1.username,
                        oxUserId: oxUserId,
                    }),
                );

                expect(await em.count(PersonEntity, { id: person1.id })).toBe(0);
                expect(await em.count(PersonenkontextEntity, { personId: person1.id })).toBe(0);
            });

            it('should log error, because person has no username', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                person1.username = '';
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;

                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId!,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                await sut.getPersonIfAllowed(person1.id, personPermissionsMock);
                const personGetAllowed: Result<Person<true>> = await sut.getPersonIfAllowed(
                    person1.id,
                    personPermissionsMock,
                );

                if (!personGetAllowed.ok) {
                    throw new EntityNotFoundError('Person', person1.id);
                }

                const removedPersonenkontexts: PersonenkontextEventKontextData[] = [];
                const result: Result<void, DomainError> = await sut.deletePersonAfterDeadlineExceeded(
                    personGetAllowed.value.id,
                    personPermissionsMock,
                    removedPersonenkontexts,
                );
                expect(result.ok).toBeTruthy();

                expect(loggerMock.error).toHaveBeenCalledWith(
                    expect.stringContaining(
                        `Failure during creation of PersonDeletedAfterDeadlineExceededEvent, username UNDEFINED, personId:${person1.id}`,
                    ),
                );
                expect(eventServiceMock.publish).toHaveBeenCalledOnce();
            });

            it('should not delete the person because of unsufficient permissions to find the person', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });

                await em.persist(em.create(PersonEntity, mapAggregateToData(person1))).flush();

                const removedPersonenkontexts: PersonenkontextEventKontextData[] = [];
                const result: Result<void, DomainError> = await sut.deletePersonAfterDeadlineExceeded(
                    person1.id,
                    personPermissionsMock,
                    removedPersonenkontexts,
                );

                expect(result.ok).toBeFalsy();
            });
            it('should not delete the person because of unsufficient permissions to delete the person', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                personPermissionsMock.getOrgIdsWithSystemrecht.mockImplementation(
                    (systemRechte: RollenSystemRecht[]) => {
                        if (systemRechte.length === 1 && systemRechte[0] === RollenSystemRecht.PERSONEN_VERWALTEN) {
                            return Promise.resolve({ all: true });
                        }
                        return Promise.resolve({ all: false, orgaIds: [] });
                    },
                );
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;
                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId!,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                const removedPersonenkontexts: PersonenkontextEventKontextData[] = [];
                const result: Result<void, DomainError> = await sut.deletePersonAfterDeadlineExceeded(
                    person1.id,
                    personPermissionsMock,
                    removedPersonenkontexts,
                );

                expect(result.ok).toBeFalsy();
                if (!result.ok) {
                    expect(result.error).toBeInstanceOf(EntityCouldNotBeDeleted);
                }
            });
            it('should not delete the person because it has no keycloakId', async () => {
                const person1: Person<true> = DoFactory.createPerson(true);
                person1.keycloakUserId = '';
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
                const personEntity: PersonEntity = new PersonEntity();
                await em.persist(personEntity.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity.id;

                kcUserServiceMock.findById.mockResolvedValue({
                    ok: true,
                    value: {
                        id: person1.keycloakUserId,
                        username: person1.username ?? '',
                        enabled: true,
                        email: faker.internet.email(),
                        createdDate: new Date(),
                        externalSystemIDs: {},
                    },
                });

                await sut.getPersonIfAllowed(person1.id, personPermissionsMock);
                const personGetAllowed: Result<Person<true>> = await sut.getPersonIfAllowed(
                    person1.id,
                    personPermissionsMock,
                );

                if (!personGetAllowed.ok) {
                    throw new EntityNotFoundError('Person', person1.id);
                }

                const removedPersonenkontexts: PersonenkontextEventKontextData[] = [];
                await expect(
                    sut.deletePersonAfterDeadlineExceeded(
                        personGetAllowed.value.id,
                        personPermissionsMock,
                        removedPersonenkontexts,
                    ),
                ).rejects.toThrow(PersonHasNoKeycloakId);
            });
        });
    });

    describe('save', () => {
        beforeEach(() => {
            vi.restoreAllMocks();
        });
        describe('when person has an id', () => {
            it('should call the update method and return the updated person', async () => {
                const existingPerson: Person<true> = await savePerson();

                const updatedPerson: Person<true> = Person.construct(
                    existingPerson.id,
                    existingPerson.createdAt,
                    existingPerson.updatedAt,
                    faker.person.lastName(),
                    faker.person.firstName(),
                    existingPerson.mandant,
                    existingPerson.stammorganisation,
                    existingPerson.keycloakUserId,
                    existingPerson.username,
                );

                const result: Person<true> | DomainError = await sut.save(updatedPerson);

                if (result instanceof DomainError) {
                    return;
                }
                expect(result.vorname).toEqual(updatedPerson.vorname);
                expect(result.familienname).toEqual(updatedPerson.familienname);
            });

            it('should correctly set and unset external systems', async () => {
                const existingPerson: Person<true> = await savePerson();

                const updatedPerson: Person<true> = Person.construct(
                    existingPerson.id,
                    existingPerson.createdAt,
                    existingPerson.updatedAt,
                    faker.person.lastName(),
                    faker.person.firstName(),
                    existingPerson.mandant,
                    existingPerson.username,
                    existingPerson.keycloakUserId,
                    existingPerson.stammorganisation,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined, //istTechnisch
                    {
                        LDAP: faker.string.uuid(), //externalIds
                    },
                );

                let result: Person<true> | DomainError = await sut.save(updatedPerson);
                if (result instanceof DomainError) {
                    throw result;
                }

                expect(result.externalIds.LDAP).toEqual(updatedPerson.externalIds.LDAP);

                updatedPerson.externalIds.LDAP = undefined;

                result = await sut.save(updatedPerson);
                if (result instanceof DomainError) {
                    throw result;
                }

                expect(result.externalIds.LDAP).toBeUndefined();
            });

            describe('when person does not have an id', () => {
                it('should call the create method and return the created person', async () => {
                    usernameGeneratorService.generateUsername.mockResolvedValueOnce({
                        ok: true,
                        value: 'testusername',
                    });

                    const person: Person<false> | DomainError = await Person.createNew(usernameGeneratorService, {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                    });

                    if (person instanceof DomainError) {
                        throw person;
                    }

                    kcUserServiceMock.create.mockResolvedValueOnce({
                        ok: true,
                        value: 'something',
                    });
                    kcUserServiceMock.setPassword.mockResolvedValueOnce({
                        ok: true,
                        value: '',
                    });
                    const savedPerson: Person<true> | DomainError = await sut.create(person);

                    if (savedPerson instanceof DomainError) {
                        throw savedPerson;
                    } else {
                        expect(savedPerson).toBeDefined();
                        expect(savedPerson.id).toBeDefined();
                    }
                });
            });
        });
    });
    describe('exists', () => {
        it('should return true if person exists', async () => {
            const person: Person<true> = await savePerson();

            const exists: boolean = await sut.exists(person.id);

            expect(exists).toBe(true);
        });

        it('should return false if person does not exist', async () => {
            const nonExistentId: string = faker.string.uuid();

            const exists: boolean = await sut.exists(nonExistentId);

            expect(exists).toBe(false);
        });
    });

    describe('createPersonScope', () => {
        it('should create a scope with the correct filters and sorting', async () => {
            await savePerson(false, { vorname: 'Alice', familienname: 'Smith', username: 'asmith1' });
            await savePerson(false, { vorname: 'Bob', familienname: 'Johnson', username: 'bjohnson1' });
            await savePerson(false, { vorname: 'Charlie', familienname: 'Brown', username: 'cbrown1' });

            const permittedOrgas: PermittedOrgas = { all: true };

            const queryParams: PersonenQueryParams = {
                offset: 0,
                limit: 10,
                sortField: SortFieldPerson.VORNAME,
                sortOrder: ScopeOrder.ASC,
            };

            const result: Counted<Person<true>> = await sut.findbyPersonFrontend(queryParams, permittedOrgas);

            expect(result).toBeDefined();

            const [persons, total]: [Person<true>[], number] = result;

            expect(total).toBe(3);

            expect(persons[0]?.vorname).toBe('Alice');
            expect(persons[1]?.vorname).toBe('Bob');
            expect(persons[2]?.vorname).toBe('Charlie');
        });

        it('should return the suchFilter', async () => {
            await savePerson(false, { vorname: 'Alice', familienname: 'Smith', username: 'asmith1' });
            const person2: Person<true> = await savePerson(false, {
                vorname: 'Bob',
                familienname: 'Johnson',
                username: 'bjohnson1',
            });
            await savePerson(false, { vorname: 'Charlie', familienname: 'Brown', username: 'cbrown1' });

            const permittedOrgas: PermittedOrgas = { all: true };

            const queryParams: PersonenQueryParams = {
                vorname: person2.vorname,
                familienname: person2.familienname,
                offset: 0,
                limit: 10,
                sortField: SortFieldPerson.VORNAME,
                sortOrder: ScopeOrder.ASC,
                suchFilter: person2.vorname,
            };

            const result: Counted<Person<true>> = await sut.findbyPersonFrontend(queryParams, permittedOrgas);

            expect(result).toBeDefined();

            const [persons, total]: [Person<true>[], number] = result;

            expect(total).toBe(1);

            expect(persons[0]?.vorname).toBe('Bob');
            expect(persons[0]?.familienname).toBe('Johnson');
        });
        it('should return undefeined if PermittedOrgas is placed', async () => {
            const person: Person<true> = await savePerson();

            const permittedOrgas: PermittedOrgas = { all: false, orgaIds: [] };

            const queryParams: PersonenQueryParams = {
                vorname: person.vorname,
                familienname: person.familienname,
                organisationIDs: undefined,
                offset: 0,
                limit: 10,
                sortField: SortFieldPerson.VORNAME,
                sortOrder: ScopeOrder.ASC,
            };

            const result: Counted<Person<true>> = await sut.findbyPersonFrontend(queryParams, permittedOrgas);

            expect(result).toBeDefined();

            const [persons, total]: [Person<true>[], number] = result;
            const [firstPerson]: Person<true>[] | undefined = persons;

            expect(firstPerson?.vorname).toBe(undefined);
            expect(firstPerson?.familienname).toBe(undefined);
            expect(total).toBe(0);
        });

        it('should use default sortField and sortOrder when not provided', async () => {
            await savePerson(false, { vorname: 'Alice', familienname: 'Smith', username: 'asmith1' });
            await savePerson(false, { vorname: 'Bob', familienname: 'Johnson', username: 'bjohnson1' });
            await savePerson(false, { vorname: 'Charlie', familienname: 'Brown', username: 'cbrown1' });

            const permittedOrgas: PermittedOrgas = { all: true };

            const queryParams: PersonenQueryParams = {
                offset: 0,
                limit: 10,
                // sortField and sortOrder are not provided
            };

            const result: Counted<Person<true>> = await sut.findbyPersonFrontend(queryParams, permittedOrgas);

            expect(result).toBeDefined();

            const [persons, total]: [Person<true>[], number] = result;

            expect(total).toBe(3);

            expect(persons[0]?.vorname).toBe('Alice');
            expect(persons[1]?.vorname).toBe('Bob');
            expect(persons[2]?.vorname).toBe('Charlie');
        });

        it('should apply sort criteria correctly for VORNAME', async () => {
            await savePerson(false, { vorname: 'Anna', familienname: 'Smith', username: 'asmith1' });
            await savePerson(false, { vorname: 'Anna', familienname: 'Johnson', username: 'ajohnson1' });
            const person1: Person<true> = await savePerson(false, {
                vorname: 'Anna',
                familienname: 'Brown',
                username: 'abrown1',
            });
            const person2: Person<true> = await savePerson(false, {
                vorname: 'Anna',
                familienname: 'Brown',
                username: 'abrown2',
            });

            const permittedOrgas: PermittedOrgas = { all: true };

            const queryParams: PersonenQueryParams = {
                offset: 0,
                limit: 10,
                sortField: SortFieldPerson.VORNAME,
                sortOrder: ScopeOrder.ASC,
            };

            const result: Counted<Person<true>> = await sut.findbyPersonFrontend(queryParams, permittedOrgas);

            expect(result).toBeDefined();

            const [persons, total]: [Person<true>[], number] = result;

            expect(total).toBe(4);
            expect(persons[0]?.familienname).toBe(person1.familienname);
            expect(persons[1]?.familienname).toBe(person2.familienname);
            expect(persons[2]?.familienname).toBe('Johnson');
            expect(persons[3]?.familienname).toBe('Smith');
        });

        it('should apply sort criteria correctly for FAMILIENNAME', async () => {
            await savePerson(false, { vorname: 'Charlie', familienname: 'Smith', username: 'csmith1' });
            await savePerson(false, { vorname: 'Bob', familienname: 'Smith', username: 'bsmith1' });
            const person1: Person<true> = await savePerson(false, {
                vorname: 'Anna',
                familienname: 'Smith',
                username: 'asmith1',
            });
            const person2: Person<true> = await savePerson(false, {
                vorname: 'Anna',
                familienname: 'Smith',
                username: 'asmith2',
            });

            const permittedOrgas: PermittedOrgas = { all: true };

            const queryParams: PersonenQueryParams = {
                offset: 0,
                limit: 10,
                sortField: SortFieldPerson.FAMILIENNAME,
                sortOrder: ScopeOrder.ASC,
            };

            const result: Counted<Person<true>> = await sut.findbyPersonFrontend(queryParams, permittedOrgas);

            expect(result).toBeDefined();

            const [persons, total]: [Person<true>[], number] = result;

            expect(total).toBe(4);

            expect(persons[0]?.vorname).toBe('Anna');
            expect(persons[1]?.vorname).toBe('Anna');
            expect(persons[0]?.username).toBe(person1.username);
            expect(persons[1]?.username).toBe(person2.username);
            expect(persons[2]?.vorname).toBe('Bob');
            expect(persons[3]?.vorname).toBe('Charlie');
        });

        it.each([SortFieldPerson.PERSONALNUMMER, SortFieldPerson.USERNAME])(
            'should apply sort criteria correctly for %s',
            async (sortField: SortFieldPerson) => {
                await savePerson(false, { vorname: 'Charlie', familienname: 'Smith', username: 'csmith' });
                await savePerson(false, { vorname: 'Bob', familienname: 'Smith', username: 'bsmith' });
                await savePerson(false, { vorname: 'Anna', familienname: 'Smith', username: 'asmith' });

                const permittedOrgas: PermittedOrgas = { all: true };

                const queryParams: PersonenQueryParams = {
                    offset: 0,
                    limit: 10,
                    sortField: sortField,
                    sortOrder: ScopeOrder.ASC,
                };

                const result: Counted<Person<true>> = await sut.findbyPersonFrontend(queryParams, permittedOrgas);

                expect(result).toBeDefined();

                const [persons, total]: [Person<true>[], number] = result;

                expect(total).toBe(3);

                expect(persons[0]?.username).toBe('asmith');
                expect(persons[1]?.username).toBe('bsmith');
                expect(persons[2]?.username).toBe('csmith');
            },
        );
    });

    describe('findByIds', () => {
        it('should return a list of persons', async () => {
            const person1: Person<true> = await savePerson(false, { username: 'testuser1' });
            const person2: Person<true> = await savePerson(false, { username: 'testuser2' });
            personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

            const persons: Person<true>[] = await sut.findByIds([person1.id, person2.id], personPermissionsMock);

            expect(persons).toHaveLength(2);
            expect(persons.some((p: Person<true>) => p.id === person1.id)).toBe(true);
            expect(persons.some((p: Person<true>) => p.id === person2.id)).toBe(true);
        });
        it('should return an empty list of persons', async () => {
            const person1: Person<true> = await savePerson(false, { username: 'testuser1' });
            const person2: Person<true> = await savePerson(false, { username: 'testuser2' });
            personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });

            const persons: Person<true>[] = await sut.findByIds([person1.id, person2.id], personPermissionsMock);

            expect(persons).toHaveLength(0);
        });
        it('should return a list of persons with one person', async () => {
            const person1: Person<true> = await savePerson(false, { username: 'testuser1' });
            const person2: Person<true> = await savePerson(false, { username: 'testuser2' });

            const rolle: Rolle<false> | DomainError = rolleFactory.createNew(
                faker.string.alpha(5),
                faker.string.uuid(),
                RollenArt.LEHR,
                [],
                [],
                [],
                [],
                false,
            );

            if (rolle instanceof DomainError) {
                return;
            }
            const savedRolle: Rolle<true> | DomainError = await rolleRepo.save(rolle);
            if (savedRolle instanceof DomainError) {
                throw Error();
            }

            const savedOrganisation: OrganisationEntity = await createAndPersistOrganisation(
                em,
                faker.string.uuid(),
                OrganisationsTyp.SONSTIGE,
                true,
            );
            await dbiamPersonenkontextRepoInternal.save(
                personenkontextFactory.createNew(person1.id, savedOrganisation.id, savedRolle.id),
            );

            personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [savedOrganisation.id],
            });

            const persons: Person<true>[] = await sut.findByIds([person1.id, person2.id], personPermissionsMock);

            expect(persons).toHaveLength(1);
            expect(persons[0]?.id).toEqual(person1.id);
        });
    });
    describe('updatePersonMetadata', () => {
        it('should return the updated person', async () => {
            const person: Person<true> = await savePerson(true);
            const newFamilienname: string = faker.person.lastName();
            const newVorname: string = faker.person.firstName();
            const newPersonalnummer: string = faker.finance.pin(7);
            const kopersLock: UserLock = {
                person: person.id,
                created_at: new Date(),
                locked_by: 'cron',
                locked_until: new Date(),
                locked_occasion: PersonLockOccasion.KOPERS_GESPERRT,
            };
            await userLockRepository.createUserLock(kopersLock);
            personPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);
            usernameGeneratorService.generateUsername.mockResolvedValueOnce({ ok: true, value: 'testusername1' });
            kcUserServiceMock.updateUsername.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            });
            kcUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            });
            const result: Person<true> | DomainError = await sut.updatePersonMetadata(
                person.id,
                newFamilienname,
                newVorname,
                newPersonalnummer,
                person.updatedAt,
                person.revision,
                personPermissionsMock,
            );
            if (result instanceof DomainError) {
                throw result;
            }

            expect(person.id).toBe(result.id);
            expect(result.familienname).toEqual(newFamilienname);
            expect(result.vorname).toEqual(newVorname);
            expect(result.username).toEqual('testusername1');

            expect(person.personalnummer).not.toEqual(newPersonalnummer);
            expect(result.personalnummer).toEqual(newPersonalnummer);
        });
        it('should return an error when keyCloakUpdate failed', async () => {
            const person: Person<true> = await savePerson(true);
            const newFamilienname: string = faker.person.lastName();
            const newVorname: string = faker.person.firstName();
            const newPersonalnummer: string = faker.finance.pin(7);
            const kopersLock: UserLock = {
                person: person.id,
                created_at: new Date(),
                locked_by: 'cron',
                locked_until: new Date(),
                locked_occasion: PersonLockOccasion.KOPERS_GESPERRT,
            };

            await userLockRepository.createUserLock(kopersLock);
            personPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);
            kcUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({
                ok: false,
                error: new KeycloakClientError('Could not update user status or database'),
            });
            await expect(
                sut.updatePersonMetadata(
                    person.id,
                    newFamilienname,
                    newVorname,
                    newPersonalnummer,
                    person.updatedAt,
                    person.revision,
                    personPermissionsMock,
                ),
            ).rejects.toThrow(DownstreamKeycloakError);
        });
        it('should return EntityNotFound when person does not exit', async () => {
            const result: Person<true> | DomainError = await sut.updatePersonMetadata(
                faker.string.uuid(),
                faker.person.lastName(),
                faker.person.firstName(),
                faker.finance.pin(7),
                faker.date.anytime(),
                '1',
                personPermissionsMock,
            );

            expect(result).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return MissingPermissionsError if the admin does not have permissions to update the person metadata', async () => {
            const person: Person<true> = await savePerson(true);
            personPermissionsMock.canModifyPerson.mockResolvedValueOnce(false);

            const result: Person<true> | DomainError = await sut.updatePersonMetadata(
                person.id,
                faker.person.lastName(),
                faker.person.firstName(),
                faker.finance.pin(7),
                person.updatedAt,
                person.revision,
                personPermissionsMock,
            );

            expect(result).toBeInstanceOf(MissingPermissionsError);
        });

        it('should return PersonalnummerRequiredError when personalnummer was not provided and faminlienname or vorname did not change', async () => {
            const person: Person<true> = await savePerson(true);
            personPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);

            const result: Person<true> | DomainError = await sut.updatePersonMetadata(
                person.id,
                person.familienname,
                person.vorname,
                '',
                person.updatedAt,
                person.revision,
                personPermissionsMock,
            );

            expect(result).toBeInstanceOf(PersonalnummerRequiredError);
        });

        it('should return DuplicatePersonalnummerError when the new personalnummer is already assigned', async () => {
            const person: Person<true> = await savePerson(true, { username: 'testuser1' });
            const person2: Person<true> = await savePerson(true, { username: 'testuser2' });
            if (!person2.personalnummer) {
                return;
            }

            personPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);

            const result: Person<true> | DomainError = await sut.updatePersonMetadata(
                person.id,
                faker.person.lastName(),
                faker.person.firstName(),
                person2.personalnummer,
                person.updatedAt,
                person.revision,
                personPermissionsMock,
            );

            expect(result).toBeInstanceOf(DuplicatePersonalnummerError);
        });

        it('should return PersonUpdateOutdatedError if there is a newer updated version', async () => {
            const person: Person<true> = await savePerson(true);
            personPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);

            const result: Person<true> | DomainError = await sut.updatePersonMetadata(
                person.id,
                faker.person.lastName(),
                faker.person.firstName(),
                faker.finance.pin(7),
                faker.date.past(),
                person.revision,
                personPermissionsMock,
            );

            expect(result).toBeInstanceOf(PersonUpdateOutdatedError);
        });

        it('should return MismatchedRevisionError if the revision is incorrect', async () => {
            const person: Person<true> = await savePerson(true);
            personPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);

            const result: Person<true> | DomainError = await sut.updatePersonMetadata(
                person.id,
                person.familienname,
                person.vorname,
                faker.finance.pin(7),
                person.updatedAt,
                '2',
                personPermissionsMock,
            );

            expect(result).toBeInstanceOf(MismatchedRevisionError);
        });

        it('should return DomainError if it cannot generate new username', async () => {
            const person: Person<true> = await savePerson(true);
            personPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);
            usernameGeneratorService.generateUsername.mockResolvedValueOnce({
                ok: false,
                error: new InvalidNameError('Could not generate valid username'),
            });
            kcUserServiceMock.updateUsername.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            });
            const result: Person<true> | DomainError = await sut.updatePersonMetadata(
                person.id,
                faker.person.lastName(),
                faker.person.firstName(),
                '',
                person.updatedAt,
                person.revision,
                personPermissionsMock,
            );
            expect(result).toBeInstanceOf(DomainError);
        });

        it('should return DomainError if keycloak cannot update the username', async () => {
            const person: Person<true> = await savePerson(true);
            personPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);
            usernameGeneratorService.generateUsername.mockResolvedValueOnce({ ok: true, value: 'testusername1' });

            kcUserServiceMock.updateUsername.mockResolvedValueOnce({
                ok: false,
                error: new EntityNotFoundError(`Keycloak User could not be found`),
            });
            const result: Person<true> | DomainError = await sut.updatePersonMetadata(
                person.id,
                faker.person.lastName(),
                faker.person.firstName(),
                '',
                person.updatedAt,
                person.revision,
                personPermissionsMock,
            );
            expect(result).toBeInstanceOf(DomainError);
        });

        it('should return VornameForPersonWithTrailingSpaceError when vorname is invalid', async () => {
            const person: Person<true> = await savePerson(true);
            personPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);

            const invalidVorname: string = ' Max ';

            const result: Person<true> | DomainError = await sut.updatePersonMetadata(
                person.id,
                faker.person.lastName(),
                invalidVorname,
                faker.finance.pin(7),
                person.updatedAt,
                person.revision,
                personPermissionsMock,
            );

            expect(result).toBeInstanceOf(VornameForPersonWithTrailingSpaceError);
        });

        it('should return FamiliennameForPersonWithTrailingSpaceError when familienname is invalid', async () => {
            const person: Person<true> = await savePerson(true);
            personPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);

            const invalidFamilienname: string = ' Mustermann ';

            const result: Person<true> | DomainError = await sut.updatePersonMetadata(
                person.id,
                invalidFamilienname, // Pass invalid familienname
                faker.person.firstName(),
                faker.finance.pin(7),
                person.updatedAt,
                person.revision,
                personPermissionsMock,
            );

            expect(result).toBeInstanceOf(FamiliennameForPersonWithTrailingSpaceError);
        });

        it('should return PersonalNummerForPersonWithTrailingSpaceError when personalnummer is invalid', async () => {
            const person: Person<true> = await savePerson(true);
            personPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);

            const invalidPersonalnummer: string = ' 12345678';

            const result: Person<true> | DomainError = await sut.updatePersonMetadata(
                person.id,
                faker.person.lastName(),
                faker.person.firstName(),
                invalidPersonalnummer,
                person.updatedAt,
                person.revision,
                personPermissionsMock,
            );

            expect(result).toBeInstanceOf(PersonalNummerForPersonWithTrailingSpaceError);
        });
    });
    describe('getKoPersUserLockList', () => {
        it('should return a list of keycloakUserIds for persons older than 56 days without a personalnummer', async () => {
            // Create the date 57 days ago
            const daysAgo: Date = new Date();
            daysAgo.setDate(daysAgo.getDate() - 57);

            const person1: Person<true> = await savePerson(false, { username: 'testuser1' });
            const person2: Person<true> = await savePerson(false, { username: 'testuser2' });
            const person3: Person<true> = await savePerson(false, { username: 'testuser3' });
            const person4: Person<true> = await savePerson(false, { username: 'testuser4' }); // Person for two PersonenKontexte

            const rolle1: Rolle<false> = DoFactory.createRolle(false, {
                name: 'rolle1',
                rollenart: RollenArt.LEHR,
                merkmale: [RollenMerkmal.KOPERS_PFLICHT],
            });

            const rolle2: Rolle<false> = DoFactory.createRolle(false, {
                name: 'rolle2',
                rollenart: RollenArt.LEIT,
                merkmale: [RollenMerkmal.KOPERS_PFLICHT],
            });

            const organisation1: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );
            const organisation2: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );

            const rolle1Result: Rolle<true> | DomainError = await rolleRepo.save(rolle1);
            const rolle2Result: Rolle<true> | DomainError = await rolleRepo.save(rolle2);
            if (rolle1Result instanceof DomainError) {
                throw Error();
            }
            if (rolle2Result instanceof DomainError) {
                throw Error();
            }

            // personenKontext where createdAt exceeds the time-limit
            vi.useFakeTimers({ now: daysAgo });
            const personenKontext1: Personenkontext<false> = DoFactory.createPersonenkontext(false, {
                personId: person1.id,
                rolleId: rolle1Result.id,
                organisationId: organisation1.id,
            });

            const personenKontext2: Personenkontext<false> = DoFactory.createPersonenkontext(false, {
                personId: person2.id,
                rolleId: rolle2Result.id,
                organisationId: organisation1.id,
            });

            const personenKontext3: Personenkontext<false> = DoFactory.createPersonenkontext(false, {
                personId: person3.id,
                rolleId: rolle2Result.id,
                organisationId: organisation1.id,
            });

            await dbiamPersonenkontextRepoInternal.save(personenKontext1);
            await dbiamPersonenkontextRepoInternal.save(personenKontext2);
            await dbiamPersonenkontextRepoInternal.save(personenKontext3);

            // personenKontext where createdAt is within the time-limit
            vi.useRealTimers();

            const personenKontext4: Personenkontext<false> = DoFactory.createPersonenkontext(false, {
                personId: person3.id,
                rolleId: rolle2Result.id,
                organisationId: organisation2.id,
            });
            const personenKontext5: Personenkontext<false> = DoFactory.createPersonenkontext(false, {
                personId: person4.id,
                rolleId: rolle2Result.id,
                organisationId: organisation2.id,
            });

            await dbiamPersonenkontextRepoInternal.save(personenKontext4);
            await dbiamPersonenkontextRepoInternal.save(personenKontext5);

            const lockList: [PersonID, string][] = await sut.getKoPersUserLockList();

            // Create tuples for the expected values
            const expectedPerson1: [PersonID, string | undefined] = [person1.id, person1.keycloakUserId];
            const expectedPerson2: [PersonID, string | undefined] = [person2.id, person2.keycloakUserId];
            const expectedPerson3: [PersonID, string | undefined] = [person3.id, person3.keycloakUserId];
            const unexpectedPerson4: [PersonID, string | undefined] = [person4.id, person4.keycloakUserId];

            // Perform the assertions
            expect(lockList).toContainEqual(expectedPerson1);
            expect(lockList).toContainEqual(expectedPerson2);
            expect(lockList).toContainEqual(expectedPerson3);
            expect(lockList).not.toContainEqual(unexpectedPerson4);
        });
        describe('getPersonWithoutOrgDeleteList', () => {
            it('should return a list of personIds for persons without a personenkontext', async () => {
                // person without personenkontext & org_unassignment_date older than 90 days
                const daysAgo: Date = new Date();
                daysAgo.setDate(daysAgo.getDate() - 90);

                const personEntity1: PersonEntity = new PersonEntity();
                const person1: Person<true> = DoFactory.createPerson(true, { orgUnassignmentDate: daysAgo });
                await em.persist(personEntity1.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity1.id;

                const personEntity2: PersonEntity = new PersonEntity();
                const person2: Person<true> = DoFactory.createPerson(true, { orgUnassignmentDate: daysAgo });
                await em.persist(personEntity2.assign(mapAggregateToData(person2))).flush();
                person2.id = personEntity2.id;

                // person with personenkontext
                const person3: Person<true> = await savePerson(false);
                const rolle1: Rolle<false> = DoFactory.createRolle(false, {
                    name: 'rolle1',
                    rollenart: RollenArt.LEHR,
                    merkmale: [RollenMerkmal.KOPERS_PFLICHT],
                });
                const rolle1Result: Rolle<true> | DomainError = await rolleRepo.save(rolle1);
                if (rolle1Result instanceof DomainError) {
                    throw Error();
                }

                const organisation1: Organisation<true> = await organisationRepository.save(
                    DoFactory.createOrganisation(false),
                );

                const personenKontext1: Personenkontext<false> = DoFactory.createPersonenkontext(false, {
                    personId: person3.id,
                    rolleId: rolle1Result.id,
                    organisationId: organisation1.id,
                });
                await dbiamPersonenkontextRepoInternal.save(personenKontext1);
                // person without personenkontext but within the time limit for org_unassignment_Date
                const person4: Person<true> = DoFactory.createPerson(true, { orgUnassignmentDate: new Date() });
                const personEntity4: PersonEntity = new PersonEntity();
                await em.persist(personEntity4.assign(mapAggregateToData(person4))).flush();
                person4.id = personEntity4.id;

                //get person ids without personenkontext
                const { ids, total }: PersonWithoutOrgDeleteListResult = await sut.getPersonWithoutOrgDeleteList();

                expect(ids).toContain(person1.id);
                expect(ids).toContain(person2.id);
                expect(ids).not.toContain(person3.id);
                expect(ids).not.toContain(person4.id);
                expect(total).toBe(2);
            });
        });
        describe('findOrganisationAdminsByOrganisationId', () => {
            it('should return a list of admins', async () => {
                const personEntity1: PersonEntity = new PersonEntity();
                const person1: Person<true> = DoFactory.createPerson(true);
                await em.persist(personEntity1.assign(mapAggregateToData(person1))).flush();
                person1.id = personEntity1.id;

                const rolle1: Rolle<false> = DoFactory.createRolle(false, {
                    name: 'rolle1',
                    rollenart: RollenArt.LEIT,
                    merkmale: [RollenMerkmal.KOPERS_PFLICHT],
                });
                const rolle1Result: Rolle<true> | DomainError = await rolleRepo.save(rolle1);
                if (rolle1Result instanceof DomainError) {
                    throw Error();
                }

                const organisation1: Organisation<true> = await organisationRepository.save(
                    DoFactory.createOrganisation(false),
                );

                const personenKontext1: Personenkontext<false> = DoFactory.createPersonenkontext(false, {
                    personId: person1.id,
                    rolleId: rolle1Result.id,
                    organisationId: organisation1.id,
                });
                await dbiamPersonenkontextRepoInternal.save(personenKontext1);
                //get admins
                const admins: string[] = await sut.findOrganisationAdminsByOrganisationId(
                    personenKontext1.organisationId,
                );

                expect(admins).toContain(person1.vorname + ' ' + person1.familienname);
            });
        });
    });
});
