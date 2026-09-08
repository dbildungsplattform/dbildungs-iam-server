import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM, UniqueConstraintViolationException } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { ConfigTestModule, DatabaseTestModule, DoFactory, LoggingTestModule } from '../../../../test/utils/index.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { generatePassword } from '../../../shared/util/password-generator.js';
import { EmailMicroserviceModule } from '../../email-microservice/email-microservice.module.js';
import { EmailPersistenceModule } from '../../email/email-persistence.module.js';
import { KeycloakUserService } from '../../keycloak-administration/index.js';
import { UserLockRepository } from '../../keycloak-administration/repository/user-lock.repository.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationModule } from '../../organisation/organisation.module.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { PersonFactory } from '../../person/domain/person.factory.js';
import { Person } from '../../person/domain/person.js';
import { UsernameGeneratorService } from '../../person/domain/username-generator.service.js';
import { OxUserBlacklistRepo } from '../../person/persistence/ox-user-blacklist.repo.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { RolleFactory } from '../../rolle/domain/rolle.factory.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RolleModule } from '../../rolle/rolle.module.js';
import { ServiceProviderModule } from '../../service-provider/service-provider.module.js';
import { PersonenkontextFactory } from '../domain/personenkontext.factory.js';
import { mapAggregateToPartial, Personenkontext } from '../domain/personenkontext.js';
import { DBiamPersonenkontextRepoInternal } from './internal-dbiam-personenkontext.repo.js';

describe('dbiam Personenkontext Repo', () => {
    let module: TestingModule;
    let sut: DBiamPersonenkontextRepoInternal;
    let orm: MikroORM;
    let em: EntityManager;

    let personFactory: PersonFactory;
    let personRepo: PersonRepository;
    let rolleRepo: RolleRepo;
    let organisationRepository: OrganisationRepository;
    let keycloakUserService: DeepMocked<KeycloakUserService>;

    let personenkontextFactory: PersonenkontextFactory;

    function createPersonenkontext<WasPersisted extends boolean>(
        this: void,
        withId: WasPersisted,
        params: Partial<Personenkontext<boolean>> = {},
    ): Personenkontext<WasPersisted> {
        const personenkontext: Personenkontext<WasPersisted> = personenkontextFactory.construct<boolean>(
            withId ? faker.string.uuid() : undefined,
            withId ? faker.date.past() : undefined,
            withId ? faker.date.recent() : undefined,
            undefined,
            faker.string.uuid(),
            faker.string.uuid(),
            faker.string.uuid(),
        );

        Object.assign(personenkontext, params);

        return personenkontext;
    }

    beforeAll(async () => {
        keycloakUserService = createMock<KeycloakUserService>(KeycloakUserService);
        keycloakUserService.create.mockResolvedValue({
            ok: true,
            value: faker.string.uuid(),
        });
        keycloakUserService.setPassword.mockResolvedValue({
            ok: true,
            value: faker.string.alphanumeric(16),
        });
        module = await Test.createTestingModule({
            imports: [
                ConfigTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                RolleModule,
                OrganisationModule,
                LoggingTestModule,
                ServiceProviderModule,
                EmailPersistenceModule,
                EmailMicroserviceModule,
            ],
            providers: [
                DBiamPersonenkontextRepoInternal,
                PersonFactory,
                PersonRepository,
                UsernameGeneratorService,
                OxUserBlacklistRepo,
                RolleFactory,
                RolleRepo,
                OrganisationRepository,
                PersonenkontextFactory,
                {
                    provide: KeycloakUserService,
                    useValue: keycloakUserService,
                },
                {
                    provide: UserLockRepository,
                    useValue: createMock<UserLockRepository>(UserLockRepository),
                },
            ],
        })
            .overrideProvider(KeycloakUserService)
            .useValue(keycloakUserService)
            .compile();

        sut = module.get(DBiamPersonenkontextRepoInternal);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);
        personFactory = module.get(PersonFactory);
        personRepo = module.get(PersonRepository);
        rolleRepo = module.get(RolleRepo);
        organisationRepository = module.get(OrganisationRepository);
        personenkontextFactory = module.get(PersonenkontextFactory);

        await DatabaseTestModule.setupDatabase(orm);
    }, 10000000);

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
        const person: Person<true> | DomainError = await personRepo.create(personResult);
        if (person instanceof DomainError) {
            throw person;
        }

        return person;
    }

    afterAll(async () => {
        await module.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
        expect(em).toBeDefined();
    });

    describe('save', () => {
        it('should save a new personenkontext', async () => {
            const person: Person<true> = await createPerson();
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const personenkontext: Personenkontext<false> = createPersonenkontext(false, {
                personId: person.id,
                rolleId: rolle.id,
                organisationId: organisation.id,
            });

            const savedPersonenkontext: Personenkontext<true> = await sut.save(personenkontext);

            expect(savedPersonenkontext.id).toBeDefined();
        });

        it('should create a new personenkontext with a id set to overrideId', async () => {
            const person: Person<true> = await createPerson();
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const personenkontext: Personenkontext<false> = createPersonenkontext(false, {
                personId: person.id,
                rolleId: rolle.id,
                organisationId: organisation.id,
            });

            personenkontext.id = faker.string.uuid();
            const savedPersonenkontext: Personenkontext<true> = await sut.create(personenkontext);

            expect(savedPersonenkontext.id).toBeDefined();
            expect(savedPersonenkontext.id).toBe(personenkontext.id);
        });

        it('should update an existing rolle', async () => {
            const person: Person<true> = await createPerson();
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const existingPersonenkontext: Personenkontext<true> = await sut.save(
                createPersonenkontext(false, {
                    personId: person.id,
                    rolleId: rolle.id,
                    organisationId: organisation.id,
                }),
            );
            const update: Personenkontext<false> = createPersonenkontext(false);
            update.id = existingPersonenkontext.id;

            const savedPersonenkontext: Personenkontext<true> = await sut.save(existingPersonenkontext);

            expect(savedPersonenkontext).toMatchObject(mapAggregateToPartial(existingPersonenkontext));
        });

        it('should throw UniqueConstraintViolationException when triplet already exists', async () => {
            const person: Person<true> = await createPerson();
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            const organisation: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const personenkontext: Personenkontext<false> = createPersonenkontext(false, {
                personId: person.id,
                rolleId: rolle.id,
                organisationId: organisation.id,
            });
            await sut.save(personenkontext);

            await expect(sut.save(personenkontext)).rejects.toThrow(UniqueConstraintViolationException);
        });
    });

    describe('delete', () => {
        describe('when personenkontext is found', () => {
            it('should delete personenkontext', async () => {
                const person: Person<true> = await createPerson();
                const rolle: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
                const organisation: Organisation<true> = await organisationRepository.save(
                    DoFactory.createOrganisation(false),
                );
                if (rolle instanceof DomainError) {
                    throw Error();
                }

                const personenkontext: Personenkontext<false> = createPersonenkontext(false, {
                    personId: person.id,
                    rolleId: rolle.id,
                    organisationId: organisation.id,
                });
                const savedPersonenkontext: Personenkontext<true> = await sut.save(personenkontext);
                await expect(sut.delete(savedPersonenkontext)).resolves.not.toThrow();
            });
        });
    });

    describe('deleteById', () => {
        describe('when deleting personenkontext by id', () => {
            it('should return number of deleted rows', async () => {
                const person: Person<true> = await createPerson();
                const rolle: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
                const organisation: Organisation<true> = await organisationRepository.save(
                    DoFactory.createOrganisation(false),
                );
                if (rolle instanceof DomainError) {
                    throw Error();
                }

                const personenKontext: Personenkontext<true> = await sut.save(
                    createPersonenkontext(false, {
                        rolleId: rolle.id,
                        personId: person.id,
                        organisationId: organisation.id,
                    }),
                );

                const result: boolean = await sut.deleteById(personenKontext.id);

                expect(result).toBeTruthy();
            });
        });

        describe('when no personenkontext was deleted', () => {
            it('should return 0', async () => {
                const result: boolean = await sut.deleteById(faker.string.uuid());

                expect(result).toBeFalsy();
            });
        });
    });
});
