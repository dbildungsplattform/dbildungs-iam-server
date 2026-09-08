import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM } from '@mikro-orm/core';
import { CallHandler, ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { Observable } from 'rxjs';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
import { CommonTestModule } from '../../../../../test/utils/common-test.module.js';
import { createMock, DeepMocked } from '../../../../../test/utils/createMock.js';
import {
    createPassportUserMock,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
} from '../../../../../test/utils/index.js';
import {
    createAndPersistOrganisation,
    createAndPersistRootOrganisation,
} from '../../../../../test/utils/organisation-test-helper.js';
import { DomainError } from '../../../../shared/error/index.js';
import { SharedExceptionFilter } from '../../../../shared/filter/shared-exception-filter.js';
import { ValidationExceptionFilter } from '../../../../shared/filter/validation-exception-filter.js';
import { PagedResponse } from '../../../../shared/paging/index.js';
import { GlobalValidationPipe } from '../../../../shared/validation/global-validation.pipe.js';
import { AuthenticationExceptionFilter } from '../../../authentication/api/authentication-exception-filter.js';
import { PersonPermissionsRepo } from '../../../authentication/domain/person-permission.repo.js';
import { PersonPermissions } from '../../../authentication/domain/person-permissions.js';
import { EmailMicroserviceModule } from '../../../email-microservice/email-microservice.module.js';
import { EmailPersistenceModule } from '../../../email/email-persistence.module.js';
import { KeycloakUserService } from '../../../keycloak-administration/index.js';
import { UserLockRepository } from '../../../keycloak-administration/repository/user-lock.repository.js';
import { OrganisationsTyp } from '../../../organisation/domain/organisation.enums.js';
import { OrganisationEntity } from '../../../organisation/persistence/organisation.entity.js';
import { OrganisationRepository } from '../../../organisation/persistence/organisation.repository.js';
import { PersonenkontextFactory } from '../../../personenkontext/domain/personenkontext.factory.js';
import { Personenkontext } from '../../../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepoInternal } from '../../../personenkontext/persistence/internal-dbiam-personenkontext.repo.js';
import { RollenArt } from '../../../rolle/domain/rolle.enums.js';
import { RolleFactory } from '../../../rolle/domain/rolle.factory.js';
import { Rolle } from '../../../rolle/domain/rolle.js';
import { RolleRepo } from '../../../rolle/repo/rolle.repo.js';
import { ServiceProviderModule } from '../../../service-provider/service-provider.module.js';
import { Person, PersonCreationParams } from '../../domain/person.js';
import { UsernameGeneratorService } from '../../domain/username-generator.service.js';
import { PersonRepository } from '../../persistence/person.repository.js';
import { PersonApiModule } from '../../person-api.module.js';
import { DBiamPersonenuebersichtResponse } from './dbiam-personenuebersicht.response.js';
import { DBiamPersonenzuordnungResponse } from './dbiam-personenzuordnung.response.js';

describe('Personenuebersicht API', () => {
    let app: INestApplication;
    let orm: MikroORM;
    let em: EntityManager;
    let personRepository: PersonRepository;
    let usernameGeneratorService: DeepMocked<UsernameGeneratorService>;
    let rolleFactory: RolleFactory;
    let rolleRepo: RolleRepo;
    let personenkontextFactory: PersonenkontextFactory;
    let dBiamPersonenkontextRepoInternal: DBiamPersonenkontextRepoInternal;
    let personpermissionsRepoMock: DeepMocked<PersonPermissionsRepo>;
    let organisationRepository: OrganisationRepository;
    let personPermissions: DeepMocked<PersonPermissions>;

    beforeAll(async () => {
        const keycloakUserServiceMock: KeycloakUserService = createMock<KeycloakUserService>(KeycloakUserService, {
            create: vi.fn().mockImplementation(() => {
                return { ok: true, value: faker.string.uuid() };
            }),
            setPassword: vi.fn().mockResolvedValue({ ok: true, value: '' }),
            delete: vi.fn().mockResolvedValue({ ok: true }),
        });

        personPermissions = createPersonPermissionsMock();
        personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

        const module: TestingModule = await Test.createTestingModule({
            imports: [
                CommonTestModule,
                PersonApiModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                ServiceProviderModule,
                EmailPersistenceModule,
                EmailMicroserviceModule,
            ],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                { provide: APP_FILTER, useClass: ValidationExceptionFilter },
                { provide: APP_FILTER, useClass: AuthenticationExceptionFilter },
                { provide: APP_FILTER, useClass: SharedExceptionFilter },
                {
                    provide: UsernameGeneratorService,
                    useValue: createMock(UsernameGeneratorService),
                },
                {
                    provide: KeycloakUserService,
                    useValue: createMock(KeycloakUserService),
                },
                {
                    provide: PersonPermissionsRepo,
                    useValue: createMock(PersonPermissionsRepo),
                },
                {
                    provide: UserLockRepository,
                    useValue: createMock(UserLockRepository),
                },
                PersonRepository,
                RolleFactory,
                RolleRepo,
                DBiamPersonenkontextRepoInternal,
                PersonenkontextFactory,
                PersonRepository,
                OrganisationRepository,
                {
                    provide: APP_INTERCEPTOR,
                    useValue: {
                        intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
                            const req: Request = context.switchToHttp().getRequest();
                            req.passportUser = createPassportUserMock(personPermissions);
                            //  createMock<PassportUser>({
                            //     async personPermissions() {
                            //         return personpermissionsRepoMock.loadPersonPermissions('');
                            //     },
                            // });
                            return next.handle();
                        },
                    },
                },
            ],
        })
            .overrideProvider(KeycloakUserService)
            .useValue(keycloakUserServiceMock)
            .compile();

        orm = module.get<MikroORM>(MikroORM);
        personRepository = module.get<PersonRepository>(PersonRepository);
        usernameGeneratorService = module.get(UsernameGeneratorService);
        usernameGeneratorService.generateUsername = vi
            .fn()
            .mockResolvedValueOnce({ ok: true, value: 'mockUsername1' })
            .mockResolvedValueOnce({ ok: true, value: 'mockUsername2' })
            .mockResolvedValueOnce({ ok: true, value: 'mockUsername3' })
            .mockResolvedValueOnce({ ok: true, value: 'mockUsername4' })
            .mockResolvedValueOnce({ ok: true, value: 'mockUsername5' })
            .mockResolvedValueOnce({ ok: true, value: 'mockUsername6' });
        rolleFactory = module.get(RolleFactory);
        rolleRepo = module.get(RolleRepo);
        dBiamPersonenkontextRepoInternal = module.get(DBiamPersonenkontextRepoInternal);
        personpermissionsRepoMock = module.get(PersonPermissionsRepo);
        personenkontextFactory = module.get(PersonenkontextFactory);
        organisationRepository = module.get(OrganisationRepository);

        em = module.get(EntityManager);

        await DatabaseTestModule.setupDatabase(module.get(MikroORM));
        app = module.createNestApplication();
        await app.init();
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    describe('/GET personenuebersicht', () => {
        describe('when successfull', () => {
            describe('when no kontexts exists', () => {
                it('should return personuebersicht with zuordnungen as []', async () => {
                    const creationParams: PersonCreationParams = {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                    };

                    const person: Person<false> | DomainError = await Person.createNew(
                        usernameGeneratorService,
                        creationParams,
                    );
                    expect(person).not.toBeInstanceOf(DomainError);
                    if (person instanceof DomainError) {
                        return;
                    }
                    const savedPerson: Person<true> | DomainError = await personRepository.create(person);
                    expect(savedPerson).not.toBeInstanceOf(DomainError);
                    if (savedPerson instanceof DomainError) {
                        return;
                    }

                    const response: Response = await request(app.getHttpServer() as App)
                        .get(`/dbiam/personenuebersicht/${savedPerson.id}`)
                        .send();

                    expect(response.status).toBe(200);
                    expect(response.body).toBeInstanceOf(Object);
                    const responseBody: DBiamPersonenuebersichtResponse =
                        response.body as DBiamPersonenuebersichtResponse;

                    expect(responseBody?.personId).toEqual(savedPerson.id);
                    expect(responseBody?.vorname).toEqual(savedPerson.vorname);
                    expect(responseBody?.nachname).toEqual(savedPerson.familienname);
                    expect(responseBody?.benutzername).toEqual(savedPerson.username);
                    expect(responseBody?.lastModifiedZuordnungen).toBeUndefined();
                    expect(responseBody?.zuordnungen).toEqual([]);
                });
            });

            describe('when kontexts exists', () => {
                it('should return personuebersicht with zuordnungen', async () => {
                    const creationParams: PersonCreationParams = {
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                    };

                    const person: Person<false> | DomainError = await Person.createNew(
                        usernameGeneratorService,
                        creationParams,
                    );
                    expect(person).not.toBeInstanceOf(DomainError);
                    if (person instanceof DomainError) {
                        return;
                    }
                    const savedPerson: Person<true> | DomainError = await personRepository.create(person);
                    expect(savedPerson).not.toBeInstanceOf(DomainError);
                    if (savedPerson instanceof DomainError) {
                        return;
                    }

                    const rolle1: Rolle<false> | DomainError = rolleFactory.createNew(
                        faker.string.alpha(5),
                        faker.string.uuid(),
                        RollenArt.LEHR,
                        [],
                        [],
                        [],
                        [],
                        false,
                    );

                    if (rolle1 instanceof DomainError) {
                        return;
                    }
                    const savedRolle1: Rolle<true> | DomainError = await rolleRepo.save(rolle1);
                    if (savedRolle1 instanceof DomainError) {
                        throw Error();
                    }

                    const rolle2: Rolle<false> | DomainError = rolleFactory.createNew(
                        faker.string.alpha(5),
                        faker.string.uuid(),
                        RollenArt.LEHR,
                        [],
                        [],
                        [],
                        [],
                        false,
                    );

                    if (rolle2 instanceof DomainError) {
                        return;
                    }
                    const savedRolle2: Rolle<true> | DomainError = await rolleRepo.save(rolle2);
                    if (savedRolle2 instanceof DomainError) {
                        throw Error();
                    }

                    const savedOrganisation1: OrganisationEntity = await createAndPersistOrganisation(
                        em,
                        undefined,
                        OrganisationsTyp.SONSTIGE,
                        true,
                    );

                    const savedOrganisation2: OrganisationEntity = await createAndPersistOrganisation(
                        em,
                        undefined,
                        OrganisationsTyp.SONSTIGE,
                        true,
                    );

                    const personenkontext1: Personenkontext<true> = await dBiamPersonenkontextRepoInternal.save(
                        personenkontextFactory.createNew(savedPerson.id, savedOrganisation1.id, savedRolle1.id),
                    );
                    const personenkontext2: Personenkontext<true> = await dBiamPersonenkontextRepoInternal.save(
                        personenkontextFactory.createNew(savedPerson.id, savedOrganisation1.id, savedRolle2.id),
                    );
                    const personenkontext3: Personenkontext<true> = await dBiamPersonenkontextRepoInternal.save(
                        personenkontextFactory.createNew(savedPerson.id, savedOrganisation2.id, savedRolle2.id),
                    );

                    const response: Response = await request(app.getHttpServer() as App)
                        .get(`/dbiam/personenuebersicht/${savedPerson.id}`)
                        .send();

                    expect(response.status).toBe(200);
                    expect(response.body).toBeInstanceOf(Object);
                    const responseBody: DBiamPersonenuebersichtResponse =
                        response.body as DBiamPersonenuebersichtResponse;
                    expect(responseBody?.personId).toEqual(savedPerson.id);
                    expect(responseBody?.vorname).toEqual(savedPerson.vorname);
                    expect(responseBody?.nachname).toEqual(savedPerson.familienname);
                    expect(responseBody?.benutzername).toEqual(savedPerson.username);
                    expect(responseBody?.lastModifiedZuordnungen).not.toBeNull();
                    expect(responseBody?.zuordnungen.length).toEqual(3);
                    expect(
                        responseBody.zuordnungen.findIndex(
                            (zuordnung: DBiamPersonenzuordnungResponse) =>
                                zuordnung.rolleId === personenkontext1.rolleId,
                        ),
                    ).not.toEqual(-1);
                    expect(
                        responseBody.zuordnungen.findIndex(
                            (zuordnung: DBiamPersonenzuordnungResponse) =>
                                zuordnung.rolleId === personenkontext2.rolleId,
                        ),
                    ).not.toEqual(-1);
                    expect(
                        responseBody.zuordnungen.findIndex(
                            (zuordnung: DBiamPersonenzuordnungResponse) =>
                                zuordnung.rolleId === personenkontext3.rolleId,
                        ),
                    ).not.toEqual(-1);
                    expect(
                        responseBody.zuordnungen.findIndex(
                            (zuordnung: DBiamPersonenzuordnungResponse) =>
                                zuordnung.sskId === personenkontext1.organisationId,
                        ),
                    ).not.toEqual(-1);
                    expect(
                        responseBody.zuordnungen.findIndex(
                            (zuordnung: DBiamPersonenzuordnungResponse) =>
                                zuordnung.sskId === personenkontext2.organisationId,
                        ),
                    ).not.toEqual(-1);
                    expect(
                        responseBody.zuordnungen.findIndex(
                            (zuordnung: DBiamPersonenzuordnungResponse) =>
                                zuordnung.sskId === personenkontext3.organisationId,
                        ),
                    ).not.toEqual(-1);
                });
            });
        });

        describe('when not successfull', () => {
            describe('when person does not exist', () => {
                it('should return Error', async () => {
                    const unsavedPerson: Person<true> = Person.construct(
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

                    const response: Response = await request(app.getHttpServer() as App)
                        .get(`/dbiam/personenuebersicht/${unsavedPerson.id}`)
                        .send();

                    expect(response.status).toBe(404);
                });
            });
        });
    });

    describe('/GET personenuebersichten', () => {
        let savedPerson1: Person<true>;
        let savedPerson2: Person<true>;
        let savedOrganisation1: OrganisationEntity;
        let savedOrganisation2: OrganisationEntity;

        beforeEach(async () => {
            // create 2 persons, 2 organisations, 2 roles and 3 personenkontexts
            // person 1 is assigned to organisation 1 with role 1+2 and organisation 2 with role 2
            // person 2 is not assigned to any organisation
            const creationParams: PersonCreationParams = {
                familienname: faker.person.lastName(),
                vorname: faker.person.firstName(),
            };

            const person1: Person<false> | DomainError = await Person.createNew(
                usernameGeneratorService,
                creationParams,
            );
            expect(person1).not.toBeInstanceOf(DomainError);
            if (person1 instanceof DomainError) {
                return;
            }

            const savedPerson1Internal: Person<true> | DomainError = await personRepository.create(person1);
            expect(savedPerson1Internal).not.toBeInstanceOf(DomainError);
            if (savedPerson1Internal instanceof DomainError) {
                return;
            }
            savedPerson1 = savedPerson1Internal;

            const person2: Person<false> | DomainError = await Person.createNew(
                usernameGeneratorService,
                creationParams,
            );

            expect(person2).not.toBeInstanceOf(DomainError);
            if (person2 instanceof DomainError) {
                return;
            }

            const savedPerson2Internal: Person<true> | DomainError = await personRepository.create(person2);
            expect(savedPerson2Internal).not.toBeInstanceOf(DomainError);
            if (savedPerson2Internal instanceof DomainError) {
                return;
            }
            savedPerson2 = savedPerson2Internal;

            const rolle1: Rolle<false> | DomainError = rolleFactory.createNew(
                faker.string.alpha(5),
                faker.string.uuid(),
                RollenArt.LEHR,
                [],
                [],
                [],
                [],
                false,
            );

            if (rolle1 instanceof DomainError) {
                return;
            }
            const savedRolle1: Rolle<true> | DomainError = await rolleRepo.save(rolle1);
            if (savedRolle1 instanceof DomainError) {
                throw Error();
            }

            const rolle2: Rolle<false> | DomainError = rolleFactory.createNew(
                faker.string.alpha(5),
                faker.string.uuid(),
                RollenArt.LERN,
                [],
                [],
                [],
                [],
                false,
            );

            if (rolle2 instanceof DomainError) {
                return;
            }
            const savedRolle2: Rolle<true> | DomainError = await rolleRepo.save(rolle2);
            if (savedRolle2 instanceof DomainError) {
                throw Error();
            }

            savedOrganisation1 = await createAndPersistRootOrganisation(em, organisationRepository);
            savedOrganisation2 = await createAndPersistOrganisation(
                em,
                savedOrganisation1.id,
                OrganisationsTyp.SONSTIGE,
                true,
            );

            await dBiamPersonenkontextRepoInternal.save(
                personenkontextFactory.createNew(savedPerson1Internal.id, savedOrganisation1.id, savedRolle1.id),
            );
            await dBiamPersonenkontextRepoInternal.save(
                personenkontextFactory.createNew(savedPerson1Internal.id, savedOrganisation1.id, savedRolle2.id),
            );
            await dBiamPersonenkontextRepoInternal.save(
                personenkontextFactory.createNew(savedPerson1Internal.id, savedOrganisation2.id, savedRolle2.id),
            );
        });

        it('should return personuebersichten with zuordnungen for if admin has same organisation', async () => {
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [savedOrganisation1.id, savedOrganisation2.id],
            });

            const response: Response = await request(app.getHttpServer() as App)
                .post(`/dbiam/personenuebersicht`)
                .send({
                    personIds: [savedPerson1.id, savedPerson2.id],
                });

            expect(response.status).toBe(201);
            expect(response.body).toBeInstanceOf(Object);
            const responseBody: PagedResponse<DBiamPersonenuebersichtResponse> =
                response.body as PagedResponse<DBiamPersonenuebersichtResponse>;
            expect(responseBody.items?.length).toEqual(1);
            const item1: DBiamPersonenuebersichtResponse | undefined = responseBody.items.at(0);

            expect(item1).toBeDefined();
            if (!(item1 instanceof DBiamPersonenuebersichtResponse)) {
                return;
            }

            expect(item1?.personId).toEqual(savedPerson1.id);
            expect(item1?.vorname).toEqual(savedPerson1.vorname);
            expect(item1?.nachname).toEqual(savedPerson1.familienname);
            expect(item1?.benutzername).toEqual(savedPerson1.username);
            expect(item1?.lastModifiedZuordnungen).not.toBeNull();
            expect(item1?.zuordnungen.length).toEqual(3);
        });

        it('should return personuebersichten with zuordnungen for if admin has rights on root', async () => {
            const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(personpermissions);

            personpermissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: true,
            });

            const response: Response = await request(app.getHttpServer() as App)
                .post(`/dbiam/personenuebersicht`)
                .send({
                    personIds: [savedPerson1.id, savedPerson2.id],
                });

            expect(response.status).toBe(201);
            expect(response.body).toBeInstanceOf(Object);
            const responseBody: PagedResponse<DBiamPersonenuebersichtResponse> =
                response.body as PagedResponse<DBiamPersonenuebersichtResponse>;
            expect(responseBody.items?.length).toEqual(2);
            const item1: DBiamPersonenuebersichtResponse | undefined = responseBody.items.at(0);

            expect(item1).toBeDefined();
            if (!(item1 instanceof DBiamPersonenuebersichtResponse)) {
                return;
            }

            expect(item1?.personId).toEqual(savedPerson1.id);
            expect(item1?.vorname).toEqual(savedPerson1.vorname);
            expect(item1?.nachname).toEqual(savedPerson1.familienname);
            expect(item1?.benutzername).toEqual(savedPerson1.username);
            expect(item1?.lastModifiedZuordnungen).not.toBeNull();
            expect(item1?.zuordnungen.length).toEqual(3);
        });
    });
});
