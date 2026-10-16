import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';

import { DoFactory, expectErrResult, expectOkResult, LoggingTestModule } from '../../../../../test/utils/index.js';
import { type DomainError } from '../../../../shared/error/domain.error.js';
import { ItsLearningError } from '../../../../shared/error/its-learning.error.js';
import { CreatePersonAction, type CreatePersonParams } from '../technical/actions/create-person.action.js';
import { DeletePersonAction } from '../technical/actions/delete-person.action.js';
import { type PersonResponse, ReadPersonAction } from '../technical/actions/read-person.action.js';
import { ItsLearningIMSESApiService } from '../technical/itslearning.api-service.js';
import { IMSESInstitutionRoleType } from './role.enum.js';
import { ItslearningPersonAdapter } from './itslearning-person.adapter.js';
import { CreatePersonsAction } from '../technical/actions/create-persons.action.js';
import { type MassResult } from '../technical/actions/base-mass-action.js';
import { DeletePersonsAction } from '../technical/actions/delete-persons.action.js';
import { DomainErrorMock } from '../../../../../test/utils/error.mock.js';

describe('Itslearning Person Adapter', () => {
    let module: TestingModule;

    let sut: ItslearningPersonAdapter;
    let itsLearningServiceMock: DeepMocked<ItsLearningIMSESApiService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [
                ItslearningPersonAdapter,
                {
                    provide: ItsLearningIMSESApiService,
                    useValue: createMock(ItsLearningIMSESApiService),
                },
            ],
        }).compile();

        sut = module.get(ItslearningPersonAdapter);
        itsLearningServiceMock = module.get(ItsLearningIMSESApiService);
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterAll(async () => {
        await module.close();
    });

    describe('readPerson', () => {
        it('should call the itslearning API', async () => {
            const personId: string = faker.string.uuid();
            const syncID: string = faker.string.uuid();
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: DoFactory.createPerson(true),
            });

            await sut.readPerson(personId, syncID);

            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(expect.objectContaining({ id: personId }), syncID);
            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(expect.any(ReadPersonAction), syncID);
        });

        it('should return the result', async () => {
            const personResponse: PersonResponse = {
                username: faker.string.uuid(),
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                institutionRole: faker.helpers.enumValue(IMSESInstitutionRoleType),
                primaryRoleType: true,
            };
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: personResponse,
            });

            const result: Option<PersonResponse> = await sut.readPerson(personResponse.username);

            expect(result).toEqual(personResponse);
        });

        it('should return undefined, if the person could not be found', async () => {
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: false,
                error: new DomainErrorMock(),
            });

            const result: Option<PersonResponse> = await sut.readPerson(faker.string.uuid());

            expect(result).toBeUndefined();
        });
    });

    describe('updateEmail', () => {
        it('should call itslearning', async () => {
            const personId: string = faker.string.uuid();
            const email: string = faker.internet.email();
            const personResponse: PersonResponse = {
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                username: faker.internet.username(),
                institutionRole: faker.helpers.enumValue(IMSESInstitutionRoleType),
                primaryRoleType: true,
            };
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: personResponse,
            }); // ReadPersonAction
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            }); // CreatePersonAction
            const syncID: string = faker.string.uuid();

            const updateResult: Result<void, DomainError> = await sut.updateEmail(personId, email, syncID);

            expectOkResult(updateResult);
            expect(itsLearningServiceMock.send).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({ id: personId }),
                syncID,
            );
            expect(itsLearningServiceMock.send).toHaveBeenNthCalledWith(1, expect.any(ReadPersonAction), syncID);
            expect(itsLearningServiceMock.send).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    params: {
                        id: personId,
                        firstName: personResponse.firstName,
                        lastName: personResponse.lastName,
                        username: personResponse.username,
                        institutionRoleType: personResponse.institutionRole,
                        email,
                    },
                }),
                syncID,
            );
            expect(itsLearningServiceMock.send).toHaveBeenNthCalledWith(2, expect.any(CreatePersonAction), syncID);
        });

        it('should send empty string if no email is given', async () => {
            const personId: string = faker.string.uuid();
            const personResponse: PersonResponse = {
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                username: faker.internet.username(),
                institutionRole: faker.helpers.enumValue(IMSESInstitutionRoleType),
                primaryRoleType: true,
            };
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: personResponse,
            }); // ReadPersonAction
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            }); // CreatePersonAction
            const syncID: string = faker.string.uuid();

            const updateResult: Result<void, DomainError> = await sut.updateEmail(personId, undefined, syncID);

            expectOkResult(updateResult);
            expect(itsLearningServiceMock.send).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({ id: personId }),
                syncID,
            );
            expect(itsLearningServiceMock.send).toHaveBeenNthCalledWith(1, expect.any(ReadPersonAction), syncID);
            expect(itsLearningServiceMock.send).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    params: {
                        id: personId,
                        firstName: personResponse.firstName,
                        lastName: personResponse.lastName,
                        username: personResponse.username,
                        institutionRoleType: personResponse.institutionRole,
                        email: '',
                    },
                }),
                syncID,
            );
            expect(itsLearningServiceMock.send).toHaveBeenNthCalledWith(2, expect.any(CreatePersonAction), syncID);
        });

        it('should not update email, if person was not found', async () => {
            const personId: string = faker.string.uuid();
            const email: string = faker.internet.email();
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: false,
                error: new ItsLearningError('Not Found'),
            }); // ReadPersonAction

            const updateResult: Result<void, DomainError> = await sut.updateEmail(personId, email);

            expectErrResult(updateResult);
            expect(itsLearningServiceMock.send).toHaveBeenCalledTimes(1);
            expect(itsLearningServiceMock.send).not.toHaveBeenCalledWith(expect.any(CreatePersonAction));
        });
    });

    describe('createOrUpdatePerson', () => {
        it('should call the itslearning API', async () => {
            const createParams: CreatePersonParams = {
                id: faker.string.uuid(),
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                username: faker.internet.username(),
                institutionRoleType: faker.helpers.enumValue(IMSESInstitutionRoleType),
            };
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            }); // CreatePersonAction
            const syncID: string = faker.string.uuid();

            await sut.createOrUpdatePerson(createParams, syncID);

            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(
                expect.objectContaining({ params: createParams }),
                syncID,
            );
            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(expect.any(CreatePersonAction), syncID);
        });

        it('should not return error on success', async () => {
            const createParams: CreatePersonParams = {
                id: faker.string.uuid(),
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                username: faker.internet.username(),
                institutionRoleType: faker.helpers.enumValue(IMSESInstitutionRoleType),
            };
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            });

            const result: Result<void, DomainError> = await sut.createOrUpdatePerson(createParams);

            expectOkResult(result);
        });

        it('should return error, if the request failed', async () => {
            const createParams: CreatePersonParams = {
                id: faker.string.uuid(),
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                username: faker.internet.username(),
                institutionRoleType: faker.helpers.enumValue(IMSESInstitutionRoleType),
            };
            const error: DomainError = new ItsLearningError('Test Error');
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: false,
                error: error,
            });

            const result: Result<void, DomainError> = await sut.createOrUpdatePerson(createParams);

            expectErrResult(result);
            expect(result.error).toBe(error);
        });
    });

    describe('createOrUpdatePersons', () => {
        it('should call the itslearning API', async () => {
            const createParams: CreatePersonParams = {
                id: faker.string.uuid(),
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                username: faker.internet.username(),
                institutionRoleType: faker.helpers.enumValue(IMSESInstitutionRoleType),
            };
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    status: [],
                    value: undefined,
                },
            }); // CreatePersonsAction
            const syncID: string = faker.string.uuid();

            const result: Result<MassResult<void>, DomainError> = await sut.createOrUpdatePersons(
                [createParams],
                syncID,
            );

            expect(result).toEqual({
                ok: true,
                value: {
                    status: [],
                    value: undefined,
                },
            });
            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(expect.any(CreatePersonsAction), syncID);
        });
    });

    describe('deletePerson', () => {
        it('should call the itslearning API', async () => {
            const personId: string = faker.string.uuid();
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            }); // DeletePersonAction
            const syncID: string = faker.string.uuid();

            await sut.deletePerson(personId, syncID);

            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(expect.objectContaining({ id: personId }), syncID);
            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(expect.any(DeletePersonAction), syncID);
        });

        it('should not return error on success', async () => {
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            });

            const result: Option<DomainError> = await sut.deletePerson(faker.string.uuid());

            expect(result).toBeUndefined();
        });

        it('should return the error, if the request failed', async () => {
            const error: DomainError = new ItsLearningError('Test Error');

            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: false,
                error: error,
            });

            const result: Option<DomainError> = await sut.deletePerson(faker.string.uuid());

            expect(result).toBe(error);
        });
    });

    describe('deletePersons', () => {
        it('should call the itslearning API', async () => {
            const personId: string = faker.string.uuid();
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    status: [],
                    value: undefined,
                },
            }); // DeletePersonsAction
            const syncID: string = faker.string.uuid();

            const result: Result<MassResult<void>, DomainError> = await sut.deletePersons([personId], syncID);

            expect(result).toEqual({
                ok: true,
                value: {
                    status: [],
                    value: undefined,
                },
            });
            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(expect.any(DeletePersonsAction), syncID);
        });
    });
});
