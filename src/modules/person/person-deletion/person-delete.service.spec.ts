import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, TestingModule } from '@nestjs/testing';
import { faker } from '@faker-js/faker';
import { PersonDeleteService } from './person-delete.service.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonRepository } from '../persistence/person.repository.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DomainError } from '../../../shared/error/index.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { createPersonPermissionsMock } from '../../../../test/utils/index.js';
import {PersonDeleteRolleNotFoundError} from "./person-delete-rolle-not-found.error.js";

describe('PersonDeleteService', () => {
    let module: TestingModule;
    let sut: PersonDeleteService;

    let loggerMock: DeepMocked<ClassLogger>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let personRepositoryMock: DeepMocked<PersonRepository>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                PersonDeleteService,
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
            ],
        }).compile();

        sut = module.get(PersonDeleteService);
        loggerMock = module.get(ClassLogger);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        personRepositoryMock = module.get(PersonRepository);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('deletePerson', () => {
        describe('when error during loading of personenkontexte', () => {
            it('should log error', async () => {
                personenkontextRepoMock.findByPerson.mockRejectedValueOnce(new Error('Some error'));

                const res: Result<void, DomainError> = await sut.deletePerson(
                    faker.string.uuid(),
                    createPersonPermissionsMock(),
                );

                expect(res.ok).toBeFalsy();
                expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                    'Error while loading Kontexts of person to delete',
                    expect.any(Error),
                );
            });
        });

        describe('when referenced rolle cannot be loaded for any PK', () => {
            it('should log error', async () => {
                const personenkontextMock: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    id: 'dummy-id',
                });
                personenkontextMock.getRolle = vi.fn().mockResolvedValueOnce(undefined);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([personenkontextMock]);

                const res: Result<void, DomainError> = await sut.deletePerson(
                    faker.string.uuid(),
                    createPersonPermissionsMock(),
                );

                expect(res.ok).toBeFalsy();
                expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                    'Error while loading Kontexts of person to delete',
                    new PersonDeleteRolleNotFoundError(personenkontextMock),
                );
            });
        });

        describe('when getting referenced rolle for PK is resulting in rejection of promise', () => {
            it('should log error', async () => {
                const personenkontextMock: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    id: 'dummy-id',
                });
                personenkontextMock.getRolle = vi.fn().mockRejectedValueOnce(new Error('reason'));
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([personenkontextMock]);

                const res: Result<void, DomainError> = await sut.deletePerson(
                    faker.string.uuid(),
                    createPersonPermissionsMock(),
                );

                expect(res.ok).toBeFalsy();
                expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                    'Error while loading Kontexts of person to delete',
                    new Error('reason'),
                );
            });
        });

        describe('when no error during loading of personenkontexte', () => {
            it('should succeed', async () => {
                const personenkontextMock: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    id: 'dummy-id',
                });
                personenkontextMock.getRolle = vi.fn().mockResolvedValueOnce(
                    DoFactory.createRolle(true, {
                        serviceProviderData: [DoFactory.createServiceProvider(true)],
                    }),
                );
                personenkontextMock.getOrganisation = vi.fn().mockResolvedValueOnce(DoFactory.createOrganisation(true));
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([personenkontextMock]);
                personRepositoryMock.deletePerson.mockResolvedValueOnce({ ok: true, value: undefined });

                const res: Result<void, DomainError> = await sut.deletePerson(
                    faker.string.uuid(),
                    createPersonPermissionsMock(),
                );

                expect(res.ok).toBeTruthy();
                expect(loggerMock.error).toHaveBeenCalledTimes(0);
            });
        });
    });

    describe('deletePersonAfterDeadlineExceeded', () => {
        describe('when error during getPersonkontextData', () => {
            it('should log error', async () => {
                personenkontextRepoMock.findByPerson.mockRejectedValueOnce(new Error('Some error'));

                const res: Result<void, DomainError> = await sut.deletePersonAfterDeadlineExceeded(
                    faker.string.uuid(),
                    createPersonPermissionsMock(),
                );

                expect(res.ok).toBeFalsy();
                expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                    'Error while loading Kontexts of person to delete',
                    expect.any(Error),
                );
            });
        });

        describe('when getPersonkontextData succeeds', () => {
            it('should call deletePersonAfterDeadlineExceeded in PersonRepository', async () => {
                const personenkontextMock: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    id: 'dummy-id',
                });
                personenkontextMock.getRolle = vi.fn().mockResolvedValueOnce(
                    DoFactory.createRolle(true, {
                        serviceProviderData: [DoFactory.createServiceProvider(true)],
                    }),
                );
                personenkontextMock.getOrganisation = vi.fn().mockResolvedValueOnce(DoFactory.createOrganisation(true));
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([personenkontextMock]);
                personRepositoryMock.deletePersonAfterDeadlineExceeded.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });

                const res: Result<void, DomainError> = await sut.deletePersonAfterDeadlineExceeded(
                    faker.string.uuid(),
                    createPersonPermissionsMock(),
                );

                expect(res.ok).toBeTruthy();
                expect(loggerMock.error).toHaveBeenCalledTimes(0);
                expect(personRepositoryMock.deletePersonAfterDeadlineExceeded).toHaveBeenCalledTimes(1);
            });
        });
    });
});
