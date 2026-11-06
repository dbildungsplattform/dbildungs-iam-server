import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { createPersonPermissionsMock } from '../../../../test/utils/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { type DomainError, EntityNotFoundError } from '../../../shared/error/index.js';
import { KeycloakClientError } from '../../../shared/error/keycloak-client.error.js';
import { type Paged } from '../../../shared/paging/index.js';
import { type PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { KeycloakUserService } from '../../keycloak-administration/index.js';
import { PersonRepository } from '../persistence/person.repository.js';
import { PersonDomainError } from './person-domain.error.js';
import { DownstreamKeycloakError } from './person-keycloak.error.js';
import { NotFoundOrNoPermissionError } from './person-not-found-or-no-permission.error.js';
import { PersonLockOccasion } from './person.enums.js';
import { Person } from './person.js';
import { PersonService } from './person.service.js';

describe('PersonService', () => {
    let module: TestingModule;
    let sut: PersonService;
    let personRepoMock: DeepMocked<PersonRepository>;
    let keycloakUserService: DeepMocked<KeycloakUserService>;
    let logger: DeepMocked<ClassLogger>;
    let permissions: DeepMocked<PersonPermissions>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                PersonService,
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: KeycloakUserService,
                    useValue: createMock(KeycloakUserService),
                },
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
            ],
        }).compile();
        sut = module.get(PersonService);
        personRepoMock = module.get(PersonRepository);
        keycloakUserService = module.get(KeycloakUserService);
        logger = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        permissions = createPersonPermissionsMock();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('findPersonById', () => {
        describe('when person exists', () => {
            it('should get a person', async () => {
                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValue(person);
                const result: Result<Person<true>> | Error = await sut.findPersonById(person.id);
                expect(result).toEqual<Result<Person<true>>>({
                    ok: true,
                    value: person,
                });
            });
        });

        describe('when person cloud not be found', () => {
            it('should get a EntityNotFoundError error ', async () => {
                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValue(null);
                const result: Result<Person<true>> | Error = await sut.findPersonById(person.id);
                expect(result).toEqual<Result<Person<true>>>({
                    ok: false,
                    error: new EntityNotFoundError('Person', person.id),
                });
            });
        });
    });

    describe('findAllPersons', () => {
        it('should get all persons that match', async () => {
            const firstPerson: Person<true> = DoFactory.createPerson(true);
            const secondPerson: Person<true> = DoFactory.createPerson(true);
            const persons: Counted<Person<true>> = [[firstPerson, secondPerson], 2];

            personRepoMock.findBy.mockResolvedValue(persons);

            const personDoWithQueryParam: Person<false> = DoFactory.createPerson(false);
            const result: Paged<Person<true>> = await sut.findAllPersons(personDoWithQueryParam, 0, 10);

            expect(result.items).toHaveLength(2);
        });

        it('should return an empty list of persons ', async () => {
            const person: Person<false> = DoFactory.createPerson(false);

            personRepoMock.findBy.mockResolvedValue([[], 0]);

            const result: Paged<Person<true>> = await sut.findAllPersons(person);

            expect(result.items).toBeInstanceOf(Array);
            expect(result.items).toHaveLength(0);
        });
    });

    describe('lockPerson', () => {
        let person: Person<true>;
        const personId: string = 'person-id';
        const lockedBy: string = 'organisation-id';
        const lockedUntil: Date = new Date('2030-01-01T00:00:00Z');

        beforeEach(() => {
            person = createMock<Person<true>>(Person, {
                id: personId,
                username: 'user',
                keycloakUserId: 'keycloak-id',
            });
        });

        it.each([
            { lock: true, until: lockedUntil },
            { lock: true, until: undefined },
            { lock: false, until: lockedUntil },
            { lock: false, until: undefined },
        ])(
            'updates the user status when lock is $lock and expiry is $until',
            async ({ lock, until }: { lock: boolean; until: Date | undefined }) => {
                personRepoMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });
                keycloakUserService.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });

                const result: Result<void, DomainError> = await sut.lockPerson(
                    personId,
                    permissions,
                    lock,
                    lockedBy,
                    until,
                );

                expect(result).toEqual({ ok: true, value: undefined });
                expect(personRepoMock.getPersonIfAllowed).toHaveBeenCalledExactlyOnceWith(personId, permissions);
                expect(keycloakUserService.updateKeycloakUserStatus).toHaveBeenCalledExactlyOnceWith(
                    personId,
                    person.keycloakUserId,
                    {
                        person: personId,
                        locked_by: lockedBy,
                        locked_until: until,
                        locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
                        created_at: undefined,
                    },
                    lock,
                );
                expect(logger.info).toHaveBeenCalledExactlyOnceWith(
                    `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}, Sperrende Organisation: ${lockedBy}) hat Benutzer ${person.username} (BenutzerId: ${personId})) ${lock ? 'gesperrt' : 'entsperrt'} (Befristung: ${until?.toString() ?? 'unbefristet'}).`,
                );
                expect(logger.error).not.toHaveBeenCalled();
            },
        );

        describe('when the person is missing or unauthorized', () => {
            it('returns an error when locking', async () => {
                personRepoMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: false,
                    error: new EntityNotFoundError('Person'),
                });
                const error: NotFoundOrNoPermissionError = new NotFoundOrNoPermissionError(personId);

                const result: Result<void, DomainError> = await sut.lockPerson(personId, permissions, true, lockedBy);

                expect(result).toEqual({ ok: false, error });
                expect(personRepoMock.getPersonIfAllowed).toHaveBeenCalledExactlyOnceWith(personId, permissions);
                expect(keycloakUserService.updateKeycloakUserStatus).not.toHaveBeenCalled();
                expect(logger.error).toHaveBeenCalledExactlyOnceWith(
                    `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat versucht den Benutzer (BenutzerId: ${personId}) zu sperren. Fehler: ${error.message}.`,
                );
                expect(logger.info).not.toHaveBeenCalled();
            });

            it('returns an error when unlocking', async () => {
                personRepoMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: false,
                    error: new EntityNotFoundError('Person'),
                });
                const error: NotFoundOrNoPermissionError = new NotFoundOrNoPermissionError(personId);

                const result: Result<void, DomainError> = await sut.lockPerson(personId, permissions, false, lockedBy);

                expect(result).toEqual({ ok: false, error });
                expect(personRepoMock.getPersonIfAllowed).toHaveBeenCalledExactlyOnceWith(personId, permissions);
                expect(keycloakUserService.updateKeycloakUserStatus).not.toHaveBeenCalled();
                expect(logger.error).toHaveBeenCalledExactlyOnceWith(
                    `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat versucht den Benutzer (BenutzerId: ${personId}) zu entsperren. Fehler: ${error.message}.`,
                );
                expect(logger.info).not.toHaveBeenCalled();
            });
        });

        describe('when the Keycloak ID is missing', () => {
            it('returns an error when locking', async () => {
                person.keycloakUserId = undefined;
                personRepoMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });
                const error: PersonDomainError = new PersonDomainError(
                    `Person with id ${personId} has no keycloak id`,
                    personId,
                );

                const result: Result<void, DomainError> = await sut.lockPerson(personId, permissions, true, lockedBy);

                expect(result).toEqual({ ok: false, error });
                expect(keycloakUserService.updateKeycloakUserStatus).not.toHaveBeenCalled();
                expect(logger.error).toHaveBeenCalledExactlyOnceWith(
                    `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat versucht den Benutzer ${person.username} (BenutzerId: ${personId}) zu sperren. Fehler: ${error.message}.`,
                );
                expect(logger.info).not.toHaveBeenCalled();
            });

            it('returns an error when unlocking', async () => {
                person.keycloakUserId = undefined;
                personRepoMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });
                const error: PersonDomainError = new PersonDomainError(
                    `Person with id ${personId} has no keycloak id`,
                    personId,
                );

                const result: Result<void, DomainError> = await sut.lockPerson(personId, permissions, false, lockedBy);

                expect(result).toEqual({ ok: false, error });
                expect(keycloakUserService.updateKeycloakUserStatus).not.toHaveBeenCalled();
                expect(logger.error).toHaveBeenCalledExactlyOnceWith(
                    `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat versucht den Benutzer ${person.username} (BenutzerId: ${personId}) zu entsperren. Fehler: ${error.message}.`,
                );
                expect(logger.info).not.toHaveBeenCalled();
            });
        });

        describe('when Keycloak returns an error', () => {
            it('wraps the downstream error when locking', async () => {
                personRepoMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });
                const downstreamError: KeycloakClientError = new KeycloakClientError('Could not update user status');
                keycloakUserService.updateKeycloakUserStatus.mockResolvedValueOnce({
                    ok: false,
                    error: downstreamError,
                });
                const error: DownstreamKeycloakError = new DownstreamKeycloakError(downstreamError.message, personId, [
                    downstreamError.details,
                ]);

                const result: Result<void, DomainError> = await sut.lockPerson(personId, permissions, true, lockedBy);

                expect(result).toEqual({ ok: false, error });
                expect(logger.error).toHaveBeenCalledExactlyOnceWith(
                    `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}, Sperrende Organisation: ${lockedBy}) hat versucht den Benutzer ${person.username} (BenutzerId: ${personId}) zu sperren. Fehler: ${error.message}.`,
                );
                expect(logger.info).not.toHaveBeenCalled();
            });

            it('wraps the downstream error when unlocking', async () => {
                personRepoMock.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: person });
                const downstreamError: KeycloakClientError = new KeycloakClientError('Could not update user status');
                keycloakUserService.updateKeycloakUserStatus.mockResolvedValueOnce({
                    ok: false,
                    error: downstreamError,
                });
                const error: DownstreamKeycloakError = new DownstreamKeycloakError(downstreamError.message, personId, [
                    downstreamError.details,
                ]);

                const result: Result<void, DomainError> = await sut.lockPerson(personId, permissions, false, lockedBy);

                expect(result).toEqual({ ok: false, error });
                expect(logger.error).toHaveBeenCalledExactlyOnceWith(
                    `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}, Sperrende Organisation: ${lockedBy}) hat versucht den Benutzer ${person.username} (BenutzerId: ${personId}) zu entsperren. Fehler: ${error.message}.`,
                );
                expect(logger.info).not.toHaveBeenCalled();
            });
        });
    });
});
