import { faker } from '@faker-js/faker';
import { NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import {
    ConfigTestModule,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DoFactory,
} from '../../../../test/utils/index.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { LdapAdapter } from '../../../core/ldap/adapter/domain/ldap.adapter.js';
import { LdapSyncEventHandler } from '../../../core/ldap/domain/ldap-sync-event-handler.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DuplicatePersonalnummerError } from '../../../shared/error/duplicate-personalnummer.error.js';
import { EntityCouldNotBeDeleted, EntityNotFoundError, MismatchedRevisionError } from '../../../shared/error/index.js';
import { KeycloakClientError } from '../../../shared/error/keycloak-client.error.js';
import { KafkaPersonExternalSystemsSyncEvent } from '../../../shared/events/kafka-person-external-systems-sync.event.js';
import { PersonExternalSystemsSyncEvent } from '../../../shared/events/person-external-systems-sync.event.js';
import { type Paged, type PagedResponse } from '../../../shared/paging/index.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { EmailAddressStatus } from '../../email/domain/email-address.js';
import { KeycloakUserService } from '../../keycloak-administration/index.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { PersonenkontextQueryParams } from '../../personenkontext/api/param/personenkontext-query.params.js';
import { type PersonenkontextResponse } from '../../personenkontext/api/response/personenkontext.response.js';
import { DBiamPersonenkontextService } from '../../personenkontext/domain/dbiam-personenkontext.service.js';
import { Personenstatus, SichtfreigabeType } from '../../personenkontext/domain/personenkontext.enums.js';
import { type Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { PersonenkontextService } from '../../personenkontext/domain/personenkontext.service.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { PersonDomainError } from '../domain/person-domain.error.js';
import { NotFoundOrNoPermissionError } from '../domain/person-not-found-or-no-permission.error.js';
import { PersonUserPasswordModificationError } from '../domain/person-user-password-modification.error.js';
import { PersonLockOccasion } from '../domain/person.enums.js';
import { PersonFactory } from '../domain/person.factory.js';
import { Person } from '../domain/person.js';
import { PersonalnummerRequiredError } from '../domain/personalnummer-required.error.js';
import { UsernameGeneratorService } from '../domain/username-generator.service.js';
import { VornameForPersonWithTrailingSpaceError } from '../domain/vorname-with-trailing-space.error.js';
import { PersonApiMapper } from '../mapper/person-api.mapper.js';
import { PersonRepository } from '../persistence/person.repository.js';
import { PersonDeleteService } from '../person-deletion/person-delete.service.js';
import { PersonLandesbediensteterSearchService } from '../person-landesbedienstete-search/person-landesbediensteter-search.service.js';
import { LockUserBodyParams } from './lock-user.body.params.js';
import { PersonByIdParams } from './person-by-id.param.js';
import { PersonEmailResponse } from './person-email-response.js';
import { PersonLandesbediensteterSearchQueryParams } from './person-landesbediensteter-search-query.param.js';
import { PersonLandesbediensteterSearchResponse } from './person-landesbediensteter-search.response.js';
import { PersonMetadataBodyParams } from './person-metadata.body.param.js';
import { PersonController } from './person.controller.js';
import { PersonendatensatzResponse } from './personendatensatz.response.js';
import { type UpdatePersonBodyParams } from './update-person.body.params.js';

describe('PersonController', () => {
    let module: TestingModule;
    let logger: ClassLogger;
    let personController: PersonController;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let emailResolverService: DeepMocked<EmailResolverService>;
    let personenkontextServiceMock: DeepMocked<PersonenkontextService>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let keycloakUserService: DeepMocked<KeycloakUserService>;
    let personDeleteServiceMock: DeepMocked<PersonDeleteService>;
    let personLandesbediensteterSearchServiceMock: DeepMocked<PersonLandesbediensteterSearchService>;
    let personPermissionsMock: DeepMocked<PersonPermissions>;
    let dBiamPersonenkontextServiceMock: DeepMocked<DBiamPersonenkontextService>;
    let eventServiceMock: DeepMocked<EventRoutingLegacyKafkaService>;
    let ldapClientAdapterMock: DeepMocked<LdapAdapter>;

    const rootOrgaId: string = faker.string.uuid();
    const configServiceMock: DeepMocked<ConfigService> = createMock(ConfigService);
    configServiceMock.getOrThrow.mockReturnValue({ ROOT_ORGANISATION_ID: rootOrgaId });

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: false })],
            providers: [
                PersonController,
                PersonFactory,
                PersonApiMapper,
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
                {
                    provide: UsernameGeneratorService,
                    useValue: createMock(UsernameGeneratorService),
                },
                {
                    provide: KeycloakUserService,
                    useValue: createMock(KeycloakUserService),
                },
                {
                    provide: PersonDeleteService,
                    useValue: createMock(PersonDeleteService),
                },
                {
                    provide: PersonLandesbediensteterSearchService,
                    useValue: createMock(PersonLandesbediensteterSearchService),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: UsernameGeneratorService,
                    useValue: createMock(UsernameGeneratorService),
                },
                {
                    provide: ConfigService,
                    useValue: configServiceMock,
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: PersonenkontextService,
                    useValue: createMock(PersonenkontextService),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: DBiamPersonenkontextService,
                    useValue: createMock(DBiamPersonenkontextService),
                },
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
                {
                    provide: EventRoutingLegacyKafkaService,
                    useValue: createMock(EventRoutingLegacyKafkaService),
                },
                {
                    provide: LdapAdapter,
                    useValue: createMock(LdapAdapter),
                },
                {
                    provide: LdapSyncEventHandler,
                    useValue: createMock(LdapSyncEventHandler),
                },
                {
                    provide: EmailResolverService,
                    useValue: createMock(EmailResolverService),
                },
            ],
        })
            .overrideProvider(EventRoutingLegacyKafkaService)
            .useValue(createMock(EventRoutingLegacyKafkaService))
            .overrideProvider(KeycloakUserService)
            .useValue(createMock(KeycloakUserService))
            .compile();
        logger = module.get(ClassLogger);
        personController = module.get(PersonController);
        personRepositoryMock = module.get(PersonRepository);
        emailResolverService = module.get(EmailResolverService);
        personenkontextServiceMock = module.get(PersonenkontextService);
        rolleRepoMock = module.get(RolleRepo);
        personDeleteServiceMock = module.get(PersonDeleteService);
        keycloakUserService = module.get(KeycloakUserService);
        dBiamPersonenkontextServiceMock = module.get(DBiamPersonenkontextService);
        eventServiceMock = module.get(EventRoutingLegacyKafkaService);
        ldapClientAdapterMock = module.get(LdapAdapter);
        personLandesbediensteterSearchServiceMock = module.get(PersonLandesbediensteterSearchService);
    });

    function getPerson(): Person<true> {
        const username: string = faker.lorem.word();
        return Person.construct(
            faker.string.uuid(),
            faker.date.past(),
            faker.date.recent(),
            faker.person.lastName(),
            faker.person.firstName(),
            '1',
            username,
            faker.lorem.word(),
            undefined, // stammorganisation
            undefined, // personalnummer
            undefined, // orgUnassignmentDate
            [
                {
                    person: '1',
                    locked_by: 'test',
                    locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
                    locked_until: new Date(),
                    created_at: new Date(),
                },
            ], // userLock array
            undefined, // isLocked
            undefined, // email
        );
    }

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        personPermissionsMock = createPersonPermissionsMock();
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(personController).toBeDefined();
        expect(personLandesbediensteterSearchServiceMock).toBeDefined();
    });

    describe('deletePerson', () => {
        const person: Person<true> = getPerson();
        const deleteParams: PersonByIdParams = new PersonByIdParams();
        Object.assign(deleteParams, {
            personId: person.id,
        });
        describe('when deleting a person is successful', () => {
            it('should return no error ', async () => {
                personDeleteServiceMock.deletePerson.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });
                const response: void = await personController.deletePersonById(deleteParams, personPermissionsMock);

                expect(response).toBeUndefined();
                expect(personDeleteServiceMock.deletePerson).toHaveBeenCalledTimes(1);
            });
        });
        describe('when deleting a person returns a domain error', () => {
            it('should throw HttpException', async () => {
                personDeleteServiceMock.deletePerson.mockResolvedValueOnce({
                    ok: false,
                    error: new EntityCouldNotBeDeleted('entity', faker.string.uuid()),
                });
                await expect(
                    personController.deletePersonById(deleteParams, personPermissionsMock),
                ).rejects.toBeInstanceOf(EntityCouldNotBeDeleted);
            });
        });
    });

    describe('when getting a person', () => {
        const params: PersonByIdParams = new PersonByIdParams();
        Object.assign(params, {
            personId: faker.string.uuid(),
        });
        const person: Person<true> = getPerson();

        it('should get a person', async () => {
            personRepositoryMock.findById.mockResolvedValue(person);
            personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });
            emailResolverService.findEmailBySpshPerson.mockResolvedValueOnce(undefined);

            await expect(personController.findPersonById(params, personPermissionsMock)).resolves.not.toThrow();
        });

        it('should throw a domain error when permissions are insufficient', async () => {
            personRepositoryMock.findById.mockResolvedValue(undefined);
            personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                ok: false,
                error: new EntityNotFoundError(),
            });

            await expect(personController.findPersonById(params, personPermissionsMock)).rejects.toBeInstanceOf(
                EntityNotFoundError,
            );
            expect(personRepositoryMock.findById).toHaveBeenCalledTimes(0);
            expect(emailResolverService.findEmailBySpshPerson).not.toHaveBeenCalled();
        });

        describe('when person has no email-address assigned', () => {
            it('should get a person without email from the microservice', async () => {
                personRepositoryMock.findById.mockResolvedValue(person);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });
                emailResolverService.findEmailBySpshPerson.mockResolvedValueOnce(undefined);
                const personResponse: PersonendatensatzResponse = await personController.findPersonById(
                    params,
                    personPermissionsMock,
                );

                expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`using new Microservice`));
                expect(emailResolverService.findEmailBySpshPerson).toHaveBeenCalledExactlyOnceWith(person.id);
                expect(personResponse.person.email).toEqual(undefined);
            });
        });

        describe('when person has an email-address assigned', () => {
            it('should get a person with email from the microservice', async () => {
                personRepositoryMock.findById.mockResolvedValue(person);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });
                const fakeEmailAddress: string = faker.internet.email();
                emailResolverService.findEmailBySpshPerson.mockResolvedValueOnce(
                    new PersonEmailResponse(EmailAddressStatus.ENABLED, fakeEmailAddress),
                );
                const personResponse: PersonendatensatzResponse = await personController.findPersonById(
                    params,
                    personPermissionsMock,
                );

                if (!personResponse.person.email) {
                    throw Error();
                }
                expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`using new Microservice`));
                expect(emailResolverService.findEmailBySpshPerson).toHaveBeenCalledExactlyOnceWith(person.id);
                expect(personResponse.person.email.status).toStrictEqual(EmailAddressStatus.ENABLED);
                expect(personResponse.person.email.address).toStrictEqual(fakeEmailAddress);
            });
        });
    });

    describe('findLandesbediensteter', () => {
        const queryParams: PersonLandesbediensteterSearchQueryParams = new PersonLandesbediensteterSearchQueryParams();
        Object.assign(queryParams, {
            personalnummer: '1234567',
            primaryEmailAddress: 'test@example.com',
            username: 'tester',
            vorname: 'Tester',
            familienname: 'Testis',
        });

        beforeEach(() => {
            personPermissionsMock = createPersonPermissionsMock();
        });

        it('should return search result when permissions are sufficient', async () => {
            const responseMock: PersonLandesbediensteterSearchResponse =
                PersonLandesbediensteterSearchResponse.createNew(DoFactory.createPerson(true), [], undefined);
            personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: true,
            });

            personLandesbediensteterSearchServiceMock.findLandesbediensteter.mockResolvedValueOnce([responseMock]);

            const result: PersonLandesbediensteterSearchResponse[] = await personController.findLandesbediensteter(
                queryParams,
                personPermissionsMock,
            );

            expect(result).toEqual([responseMock]);
            expect(personLandesbediensteterSearchServiceMock.findLandesbediensteter).toHaveBeenCalledWith(
                queryParams.personalnummer,
                queryParams.primaryEmailAddress,
                queryParams.username,
                queryParams.vorname,
                queryParams.familienname,
            );
        });

        it('should throw UnauthorizedException if no permitted orgas are found', async () => {
            personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [],
            });

            await expect(personController.findLandesbediensteter(queryParams, personPermissionsMock)).rejects.toThrow(
                UnauthorizedException,
            );
        });
    });

    describe('createPersonenkontext', () => {
        it('should throw NotImplemented error', () => {
            expect(() => personController.createPersonenkontext()).toThrow(NotImplementedException);
        });
    });

    describe('findPersonenkontexte', () => {
        describe('When fetching personenkontexte is successful', () => {
            it('should get all personenkontexte', async () => {
                const pathParams: PersonByIdParams = new PersonByIdParams();
                Object.assign(pathParams, {
                    personId: faker.string.uuid(),
                });
                const queryParams: PersonenkontextQueryParams = new PersonenkontextQueryParams();
                Object.assign(queryParams, {
                    username: 'username',
                    sichtfreigabe: SichtfreigabeType.NEIN,
                    personenstatus: Personenstatus.AKTIV,
                });
                const personenkontextResponse: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    getRolle: () => rolleRepoMock.findById(faker.string.uuid()),
                });
                const personenkontextDtos: Paged<Personenkontext<true>> = {
                    items: [personenkontextResponse],
                    total: 1,
                    offset: 0,
                    limit: 1,
                };
                personPermissionsMock = createPersonPermissionsMock();

                personenkontextServiceMock.findAllPersonenkontexte.mockResolvedValue(personenkontextDtos);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: getPerson() });

                const result: PagedResponse<PersonenkontextResponse> = await personController.findPersonenkontexte(
                    pathParams,
                    queryParams,
                    personPermissionsMock,
                );

                expect(result.items.length).toBe(1);
                expect(result.items[0]?.id).toBe(personenkontextDtos.items[0]?.id);
            });
        });

        describe('when permissions are insufficient to fetch personenkontexte', () => {
            it('should throw a domain error', async () => {
                const pathParams: PersonByIdParams = new PersonByIdParams();
                Object.assign(pathParams, {
                    personId: faker.string.uuid(),
                });
                const queryParams: PersonenkontextQueryParams = new PersonenkontextQueryParams();
                Object.assign(queryParams, {
                    username: 'username',
                    sichtfreigabe: SichtfreigabeType.NEIN,
                    personenstatus: Personenstatus.AKTIV,
                });
                const personenkontextResponse: Personenkontext<true> = DoFactory.createPersonenkontext(true);

                const personenkontextDtos: Paged<Personenkontext<true>> = {
                    items: [personenkontextResponse],
                    total: 1,
                    offset: 0,
                    limit: 1,
                };
                personPermissionsMock = createPersonPermissionsMock();

                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: false,
                    error: new EntityNotFoundError(),
                });
                personenkontextServiceMock.findAllPersonenkontexte.mockResolvedValue(personenkontextDtos);
                await expect(
                    personController.findPersonenkontexte(pathParams, queryParams, personPermissionsMock),
                ).rejects.toBeInstanceOf(EntityNotFoundError);
            });
        });
    });

    describe('resetPasswordByPersonId', () => {
        describe('when resetting password for a person', () => {
            const params: PersonByIdParams = new PersonByIdParams();
            Object.assign(params, {
                personId: faker.string.uuid(),
            });
            const person: Person<true> = getPerson();
            personPermissionsMock = createPersonPermissionsMock();

            it('should reset password for person', async () => {
                personRepositoryMock.findById.mockResolvedValue(person);
                personRepositoryMock.update.mockResolvedValue(person);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });

                await expect(
                    personController.resetPasswordByPersonId(params, personPermissionsMock),
                ).resolves.not.toThrow();
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(1);
            });
        });

        describe('when resetting password for a person returns a domain error', () => {
            const params: PersonByIdParams = new PersonByIdParams();
            Object.assign(params, {
                personId: faker.string.uuid(),
            });
            const person: Person<true> = getPerson();
            personPermissionsMock = createPersonPermissionsMock();

            it('should throw HttpException', async () => {
                personRepositoryMock.findById.mockResolvedValue(person);
                personRepositoryMock.update.mockResolvedValue(new KeycloakClientError(''));
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });

                await expect(
                    personController.resetPasswordByPersonId(params, personPermissionsMock),
                ).rejects.toBeInstanceOf(KeycloakClientError);
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(1);
            });
        });

        describe('when person does not exist', () => {
            const params: PersonByIdParams = new PersonByIdParams();
            Object.assign(params, {
                personId: faker.string.uuid(),
            });
            const person: Person<true> = getPerson();
            personPermissionsMock = createPersonPermissionsMock();

            it('should throw HttpException', async () => {
                personRepositoryMock.findBy.mockResolvedValue([[], 0]);
                personRepositoryMock.update.mockResolvedValue(person);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: false,
                    error: new EntityNotFoundError(),
                });

                await expect(
                    personController.resetPasswordByPersonId(params, personPermissionsMock),
                ).rejects.toBeInstanceOf(EntityNotFoundError);
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(0);
            });
        });

        describe('when permissions are insufficient to reset user-password', () => {
            const params: PersonByIdParams = new PersonByIdParams();
            Object.assign(params, {
                personId: faker.string.uuid(),
            });
            const person: Person<true> = getPerson();
            personPermissionsMock = createPersonPermissionsMock();

            it('should throw a domain error', async () => {
                personRepositoryMock.findById.mockResolvedValue(undefined);
                personRepositoryMock.update.mockResolvedValue(person);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: false,
                    error: new EntityNotFoundError(),
                });

                await expect(
                    personController.resetPasswordByPersonId(params, personPermissionsMock),
                ).rejects.toBeInstanceOf(EntityNotFoundError);
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(0);
            });
        });
    });

    describe('updatePerson', () => {
        const params: PersonByIdParams = new PersonByIdParams();
        Object.assign(params, {
            personId: faker.string.uuid(),
        });
        const body: UpdatePersonBodyParams = {
            stammorganisation: faker.string.uuid(),
            username: 'username',
            name: {
                vorname: 'john',
                familienname: 'doe',
            },
            revision: '1',
        };
        personPermissionsMock = createPersonPermissionsMock();

        describe('when updating a person is successful', () => {
            const person: Person<true> = getPerson();

            it('should return PersonendatensatzResponse', async () => {
                personRepositoryMock.findById.mockResolvedValue(person);
                personRepositoryMock.update.mockResolvedValue(person);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });

                await expect(
                    personController.updatePerson(params, body, personPermissionsMock),
                ).resolves.toBeInstanceOf(PersonendatensatzResponse);
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(1);
            });
        });

        describe('when person does not exist', () => {
            const person: Person<true> = getPerson();

            it('should throw a domain error', async () => {
                personRepositoryMock.findBy.mockResolvedValue([[], 0]);
                personRepositoryMock.update.mockResolvedValue(person);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: false,
                    error: new EntityNotFoundError(),
                });

                await expect(personController.updatePerson(params, body, personPermissionsMock)).rejects.toBeInstanceOf(
                    EntityNotFoundError,
                );
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(0);
            });
        });

        describe('when revision does not match', () => {
            const person: Person<true> = getPerson();
            person.revision = '10';

            it('should throw a domain error', async () => {
                personRepositoryMock.findById.mockResolvedValue(person);
                personRepositoryMock.update.mockResolvedValue(person);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });

                await expect(personController.updatePerson(params, body, personPermissionsMock)).rejects.toBeInstanceOf(
                    MismatchedRevisionError,
                );
                //expect(personRepositoryMock.findById).toHaveBeenCalledTimes(1);
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(0);
            });
        });

        describe('when permissions are insufficient to update user', () => {
            const person: Person<true> = getPerson();
            person.revision = '10';

            it('should throw a domain error', async () => {
                personRepositoryMock.findById.mockResolvedValue(person);
                personRepositoryMock.update.mockResolvedValue(person);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: false,
                    error: new EntityNotFoundError(),
                });

                await expect(personController.updatePerson(params, body, personPermissionsMock)).rejects.toBeInstanceOf(
                    EntityNotFoundError,
                );
                expect(personRepositoryMock.findById).toHaveBeenCalledTimes(0);
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(0);
            });
        });

        describe('when updated vorname has trailing space', () => {
            const person: Person<true> = getPerson();
            const bodyParams: UpdatePersonBodyParams = {
                stammorganisation: faker.string.uuid(),
                username: 'username',
                name: {
                    vorname: ' john',
                    familienname: 'doe',
                },
                revision: '1',
            };

            it('should throw VornameForPersonWithTrailingSpaceError', async () => {
                personRepositoryMock.findById.mockResolvedValue(person);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });

                await expect(personController.updatePerson(params, bodyParams, personPermissionsMock)).rejects.toThrow(
                    VornameForPersonWithTrailingSpaceError,
                );
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(0);
            });
        });
    });
    describe('lockPerson', () => {
        const params: PersonByIdParams = new PersonByIdParams();
        Object.assign(params, {
            personId: faker.string.uuid(),
        });
        personPermissionsMock = createPersonPermissionsMock();

        describe('when locking a user is successful', () => {
            const person: Person<true> = getPerson();

            it.each([[new Date()], [undefined]])(
                'should return a success message when locked_until is %p',
                async (lockedUntil: Date | undefined) => {
                    const lockUserBodyParams: LockUserBodyParams = new LockUserBodyParams();
                    Object.assign(lockUserBodyParams, {
                        lock: true,
                        locked_by: 'Theo Tester',
                        locked_until: lockedUntil,
                    });
                    personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });
                    keycloakUserService.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });

                    const response: { message: string } = await personController.lockPerson(
                        params.personId,
                        lockUserBodyParams,
                        personPermissionsMock,
                    );

                    expect(response).toEqual({ message: 'User has been successfully locked.' });
                    expect(personRepositoryMock.getPersonIfAllowed).toHaveBeenCalledTimes(1);
                    expect(keycloakUserService.updateKeycloakUserStatus).toHaveBeenCalledTimes(1);
                },
            );
        });

        describe('when unlocking a user is successful', () => {
            const person: Person<true> = getPerson();

            it.each([[new Date()], [undefined]])(
                'should return a success message when locked_until is %p',
                async (lockedUntil: Date | undefined) => {
                    const lockUserBodyParams: LockUserBodyParams = new LockUserBodyParams();
                    Object.assign(lockUserBodyParams, {
                        lock: false,
                        locked_by: 'Theo Tester',
                        locked_until: lockedUntil,
                    });
                    personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });
                    keycloakUserService.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });

                    const response: { message: string } = await personController.lockPerson(
                        params.personId,
                        lockUserBodyParams,
                        personPermissionsMock,
                    );

                    expect(response).toEqual({ message: 'User has been successfully unlocked.' });
                    expect(personRepositoryMock.getPersonIfAllowed).toHaveBeenCalledTimes(1);
                    expect(keycloakUserService.updateKeycloakUserStatus).toHaveBeenCalledTimes(1);
                },
            );
        });

        describe('when person does not exist or no permissions', () => {
            it.each([
                { lock: false, description: 'lock is false' },
                { lock: true, description: 'lock is true' },
            ])('should throw an error when $description', async ({ lock }: { lock: boolean }) => {
                const lockUserBodyParams: LockUserBodyParams = new LockUserBodyParams();
                Object.assign(lockUserBodyParams, {
                    lock,
                    locked_by: '2024-01-01T00:00:00Z',
                    locked_until: new Date(),
                });
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: false,
                    error: new EntityNotFoundError('Person'),
                });
                await expect(
                    personController.lockPerson(params.personId, lockUserBodyParams, personPermissionsMock),
                ).rejects.toThrow(PersonDomainError);
            });
        });

        describe('when keycloakUserId is missing', () => {
            const person: Person<true> = getPerson();
            person.keycloakUserId = undefined;

            it.each([
                { lock: false, description: 'lock is false' },
                { lock: true, description: 'lock is true' },
            ])('should throw an error when $description', async ({ lock }: { lock: boolean }) => {
                const lockUserBodyParams: LockUserBodyParams = new LockUserBodyParams();
                Object.assign(lockUserBodyParams, {
                    lock,
                    locked_by: '2024-01-01T00:00:00Z',
                    locked_until: new Date(),
                });
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: true,
                    value: person,
                });
                await expect(
                    personController.lockPerson(params.personId, lockUserBodyParams, personPermissionsMock),
                ).rejects.toThrow(PersonDomainError);
            });
        });

        describe('when updating user status fails', () => {
            const person: Person<true> = getPerson();
            person.keycloakUserId = 'keycloak-12345';

            it.each([
                { lock: false, description: 'lock is false' },
                { lock: true, description: 'lock is true' },
            ])('should throw an error when $description', async ({ lock }: { lock: boolean }) => {
                const lockUserBodyParams: LockUserBodyParams = new LockUserBodyParams();
                Object.assign(lockUserBodyParams, {
                    lock,
                    locked_by: '2024-01-01T00:00:00Z',
                    locked_until: new Date(),
                });
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: true,
                    value: person,
                });
                keycloakUserService.updateKeycloakUserStatus.mockResolvedValueOnce({
                    ok: false,
                    error: new KeycloakClientError('Could not update user status or custom attributes'),
                });
                await expect(
                    personController.lockPerson(params.personId, lockUserBodyParams, personPermissionsMock),
                ).rejects.toThrow(PersonDomainError);
            });
        });
    });

    describe('syncPerson', () => {
        const params: PersonByIdParams = new PersonByIdParams();
        Object.assign(params, {
            personId: faker.string.uuid(),
        });
        personPermissionsMock = createPersonPermissionsMock();

        describe('when person exists and user has permissions', () => {
            const person: Person<true> = getPerson();
            it('should publish event', async () => {
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });

                await personController.syncPerson(params.personId, personPermissionsMock);

                expect(personRepositoryMock.getPersonIfAllowed).toHaveBeenCalledTimes(1);
                expect(eventServiceMock.publish).toHaveBeenCalledWith(
                    expect.any(PersonExternalSystemsSyncEvent),
                    expect.any(KafkaPersonExternalSystemsSyncEvent),
                );
            });
        });

        describe('when person does not exists or user is missing permissions', () => {
            it('should return error', async () => {
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: false, error: new Error() });

                const syncPromise: Promise<void> = personController.syncPerson(params.personId, personPermissionsMock);

                await expect(syncPromise).rejects.toEqual(new NotFoundOrNoPermissionError(params.personId));
                expect(personRepositoryMock.getPersonIfAllowed).toHaveBeenCalledTimes(1);
                expect(eventServiceMock.publish).not.toHaveBeenCalled();
            });
        });
    });

    describe('updateMetadata', () => {
        const params: PersonByIdParams = new PersonByIdParams();
        Object.assign(params, {
            personId: faker.string.uuid(),
        });
        const body: PersonMetadataBodyParams = new PersonMetadataBodyParams();
        Object.assign(body, {
            familienname: faker.person.lastName(),
            vorname: faker.person.firstName(),
            personalnummer: faker.finance.pin(7),
            lastModified: faker.date.recent(),
            revision: '1',
        });

        it('should return 200 when successful', async () => {
            const person: Person<true> = getPerson();
            person.personalnummer = body.personalnummer;
            dBiamPersonenkontextServiceMock.isPersonalnummerRequiredForAnyPersonenkontextForPerson.mockResolvedValueOnce(
                true,
            );
            personRepositoryMock.updatePersonMetadata.mockResolvedValue(person);
            await expect(personController.updateMetadata(params, body, personPermissionsMock)).resolves.toBeInstanceOf(
                PersonendatensatzResponse,
            );
            expect(personRepositoryMock.updatePersonMetadata).toHaveBeenCalledTimes(1);
        });

        it('should throw DuplicatePersonalnummerError when Personalnummer is already assigned', async () => {
            dBiamPersonenkontextServiceMock.isPersonalnummerRequiredForAnyPersonenkontextForPerson.mockResolvedValueOnce(
                true,
            );
            personRepositoryMock.updatePersonMetadata.mockResolvedValue(
                new DuplicatePersonalnummerError('Personalnummer already exists'),
            );
            await expect(personController.updateMetadata(params, body, personPermissionsMock)).rejects.toThrow(
                DuplicatePersonalnummerError,
            );
        });

        it('should throw PersonalnummerRequiredError when personalnummer was not provided and familienname or vorname did not change', async () => {
            const person: Person<true> = getPerson();
            const bodyWithInvalidPersonalnummer: PersonMetadataBodyParams = new PersonMetadataBodyParams();
            Object.assign(bodyWithInvalidPersonalnummer, {
                familienname: person.familienname,
                vorname: person.vorname,
                personalnummer: '',
                lastModified: faker.date.recent(),
                revision: '1',
            });
            dBiamPersonenkontextServiceMock.isPersonalnummerRequiredForAnyPersonenkontextForPerson.mockResolvedValueOnce(
                true,
            );
            personRepositoryMock.updatePersonMetadata.mockResolvedValue(new PersonalnummerRequiredError());
            await expect(
                personController.updateMetadata(params, bodyWithInvalidPersonalnummer, personPermissionsMock),
            ).rejects.toThrow(PersonalnummerRequiredError);
        });

        it('should throw a domain error when revision is incorrect', async () => {
            const bodyWithInvalidRevision: PersonMetadataBodyParams = {
                familienname: faker.person.lastName(),
                vorname: faker.person.firstName(),
                personalnummer: '',
                lastModified: faker.date.recent(),
                revision: '2',
            };
            dBiamPersonenkontextServiceMock.isPersonalnummerRequiredForAnyPersonenkontextForPerson.mockResolvedValueOnce(
                true,
            );
            personRepositoryMock.updatePersonMetadata.mockResolvedValue(new MismatchedRevisionError(''));

            await expect(
                personController.updateMetadata(params, bodyWithInvalidRevision, personPermissionsMock),
            ).rejects.toBeInstanceOf(MismatchedRevisionError);
        });

        it('should throw PersonDomainError when Person has no personenkontexte where a rolle requires a KoPers.', async () => {
            dBiamPersonenkontextServiceMock.isPersonalnummerRequiredForAnyPersonenkontextForPerson.mockResolvedValueOnce(
                false,
            );
            await expect(personController.updateMetadata(params, body, personPermissionsMock)).rejects.toThrow(
                PersonDomainError,
            );
        });
    });

    describe('resetUEMPasswordByPersonId', () => {
        describe('when person does not exist', () => {
            const params: PersonByIdParams = new PersonByIdParams();
            Object.assign(params, {
                personId: faker.string.uuid(),
            });
            personPermissionsMock = createPersonPermissionsMock();

            it('should throw a domain error', async () => {
                personRepositoryMock.findBy.mockResolvedValue([[], 0]);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: false,
                    error: new EntityNotFoundError(),
                });

                await expect(
                    personController.resetUEMPasswordByPersonId(params, personPermissionsMock),
                ).rejects.toBeInstanceOf(EntityNotFoundError);
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(0);
            });
        });

        describe('when permissions are insufficient to reset user-password', () => {
            const params: PersonByIdParams = new PersonByIdParams();
            Object.assign(params, {
                personId: faker.string.uuid(),
            });
            personPermissionsMock = createPersonPermissionsMock();

            it('should throw a domain error', async () => {
                personRepositoryMock.findById.mockResolvedValue(undefined);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: false,
                    error: new EntityNotFoundError(),
                });

                await expect(
                    personController.resetUEMPasswordByPersonId(params, personPermissionsMock),
                ).rejects.toBeInstanceOf(EntityNotFoundError);
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(0);
            });
        });

        describe('when person does NOT have a defined username', () => {
            const params: PersonByIdParams = new PersonByIdParams();
            Object.assign(params, {
                personId: faker.string.uuid(),
            });
            personPermissionsMock = createPersonPermissionsMock();

            it('should throw a domain error', async () => {
                personRepositoryMock.findBy.mockResolvedValue([[], 0]);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: true,
                    value: DoFactory.createPerson<true>(true, { username: undefined }),
                });

                await expect(
                    personController.resetUEMPasswordByPersonId(params, personPermissionsMock),
                ).rejects.toBeInstanceOf(PersonDomainError);
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(0);
            });
        });

        describe('when resetting UEM-password for a person by personId succeeds', () => {
            const params: PersonByIdParams = new PersonByIdParams();
            Object.assign(params, {
                personId: faker.string.uuid(),
            });
            const person: Person<true> = getPerson();
            personPermissionsMock = createPersonPermissionsMock();

            it('should reset UEM-password for person', async () => {
                personRepositoryMock.findById.mockResolvedValue(person);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: true,
                    value: person,
                });
                ldapClientAdapterMock.changeUserPasswordByPersonId.mockResolvedValueOnce({
                    ok: true,
                    value: person.id,
                });

                await expect(
                    personController.resetUEMPasswordByPersonId(params, personPermissionsMock),
                ).resolves.not.toThrow();
                expect(ldapClientAdapterMock.changeUserPasswordByPersonId).toHaveBeenCalledTimes(1);
                expect(ldapClientAdapterMock.changeUserPasswordByPersonId).toHaveBeenCalledWith(
                    person.id,
                    person.username,
                );
            });
        });

        describe('when resetting UEM-password for a person returns a SchulConnexError', () => {
            const params: PersonByIdParams = new PersonByIdParams();
            Object.assign(params, {
                personId: faker.string.uuid(),
            });
            const person: Person<true> = getPerson();
            personPermissionsMock = createPersonPermissionsMock();

            it('should throw HttpException', async () => {
                personRepositoryMock.findById.mockResolvedValue(person);
                ldapClientAdapterMock.changeUserPasswordByPersonId.mockResolvedValueOnce({
                    ok: false,
                    error: new PersonDomainError('Person', 'entityId', undefined),
                });
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: true,
                    value: person,
                });

                await expect(
                    personController.resetUEMPasswordByPersonId(params, personPermissionsMock),
                ).rejects.toThrow(PersonUserPasswordModificationError);
                expect(ldapClientAdapterMock.changeUserPasswordByPersonId).toHaveBeenCalledTimes(1);
                expect(ldapClientAdapterMock.changeUserPasswordByPersonId).toHaveBeenCalledWith(
                    person.id,
                    person.username,
                );
            });
        });
    });

    describe('resetUEMPassword', () => {
        describe('when person does not exist', () => {
            it('should throw a domain error', async () => {
                personPermissionsMock = createPersonPermissionsMock({ id: '' });
                ldapClientAdapterMock.changeUserPasswordByPersonId.mockResolvedValueOnce({
                    ok: false,
                    error: new EntityNotFoundError('Person not found', String(404)),
                });
                await expect(personController.resetUEMPassword(personPermissionsMock)).rejects.toBeInstanceOf(
                    EntityNotFoundError,
                );
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(0);
            });
        });

        describe('when person does NOT have a defined username', () => {
            const person: Person<true> = getPerson();
            person.username = undefined;
            person.username = undefined;
            const permissions: PersonPermissions = new PersonPermissions(
                createMock(DBiamPersonenkontextRepo),
                createMock(OrganisationRepository),
                createMock(RolleRepo),
                person,
            );

            it('should throw a domain error', async () => {
                await expect(personController.resetUEMPassword(permissions)).rejects.toBeInstanceOf(PersonDomainError);
                expect(personRepositoryMock.update).toHaveBeenCalledTimes(0);
            });
        });

        describe('when resetting UEM-password for self', () => {
            const person: Person<true> = getPerson();
            const permissions: PersonPermissions = new PersonPermissions(
                createMock(DBiamPersonenkontextRepo),
                createMock(OrganisationRepository),
                createMock(RolleRepo),
                person,
            );

            it('should reset UEM-password for person', async () => {
                ldapClientAdapterMock.changeUserPasswordByPersonId.mockResolvedValueOnce({
                    ok: true,
                    value: person.id,
                });

                await expect(personController.resetUEMPassword(permissions)).resolves.not.toThrow();
                expect(ldapClientAdapterMock.changeUserPasswordByPersonId).toHaveBeenCalledTimes(1);
                expect(ldapClientAdapterMock.changeUserPasswordByPersonId).toHaveBeenCalledWith(
                    person.id,
                    person.username,
                );
            });
        });

        describe('when setting password in LDAP fails', () => {
            const person: Person<true> = getPerson();
            const permissions: PersonPermissions = new PersonPermissions(
                createMock(DBiamPersonenkontextRepo),
                createMock(OrganisationRepository),
                createMock(RolleRepo),
                person,
            );

            it('should throw DomainError', async () => {
                ldapClientAdapterMock.changeUserPasswordByPersonId.mockResolvedValueOnce({
                    ok: false,
                    error: new PersonDomainError('Person', 'entityId', undefined),
                });

                await expect(personController.resetUEMPassword(permissions)).rejects.toThrow(
                    PersonUserPasswordModificationError,
                );
                expect(ldapClientAdapterMock.changeUserPasswordByPersonId).toHaveBeenCalledTimes(1);
                expect(ldapClientAdapterMock.changeUserPasswordByPersonId).toHaveBeenCalledWith(
                    person.id,
                    person.username,
                );
            });
        });
    });
});
