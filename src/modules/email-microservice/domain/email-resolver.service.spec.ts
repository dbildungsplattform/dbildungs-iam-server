import { faker } from '@faker-js/faker';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AxiosHeaders, AxiosResponse } from 'axios';
import { of } from 'rxjs';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import {
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    expectErrResult,
    expectOkResult,
} from '../../../../test/utils/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { SetEmailAddressForSpshPersonBodyParams } from '../../../email/modules/core/api/dtos/params/set-email-address-for-spsh-person.bodyparams.js';
import { EmailAddressResponse } from '../../../email/modules/core/api/dtos/response/email-address.response.js';
import { EmailAddressStatusEnum } from '../../../email/modules/core/persistence/email-address-status.entity.js';
import { DomainError, EmailMicroserviceCommunicationError, EntityNotFoundError } from '../../../shared/error/index.js';
import { PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { EmailAddressStatus } from '../../email/domain/email-address.js';
import { EmailPersistenceModule } from '../../email/email-persistence.module.js';
import { EmailRepo } from '../../email/persistence/email.repo.js';
import { PersonEmailResponse } from '../../person/api/person-email-response.js';
import { Person } from '../../person/domain/person.js';
import { EmailMicroserviceModule } from '../email-microservice.module.js';
import { EmailResolverService, PersonIdWithEmailResponse } from './email-resolver.service.js';

describe('EmailResolverService', () => {
    let module: TestingModule;
    let sut: EmailResolverService;
    let mockHttpService: DeepMocked<HttpService>;
    let loggerMock: DeepMocked<ClassLogger>;
    let emailRepoMock: DeepMocked<EmailRepo>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                EmailMicroserviceModule,
                CommonTestModule,
                EmailPersistenceModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: false }),
            ],
            providers: [],
        })
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .overrideProvider(HttpService)
            .useValue(createMock(HttpService))
            .overrideProvider(EmailRepo)
            .useValue(createMock(EmailRepo))
            .compile();

        sut = module.get(EmailResolverService);
        mockHttpService = module.get(HttpService);
        loggerMock = module.get(ClassLogger);
        emailRepoMock = module.get(EmailRepo);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
        expect(mockHttpService).toBeDefined();
    });

    describe('findEmailBySpshPerson', () => {
        it('should return PersonEmailResponse when get call returns valid data', async () => {
            const mockPersonId: string = faker.string.uuid();
            const mockEmail: string = 'test@example.com';
            const mockResponseData: EmailAddressResponse[] = [
                createMock<EmailAddressResponse>(EmailAddressResponse, {
                    address: mockEmail,
                    status: EmailAddressStatusEnum.ACTIVE,
                }),
            ];
            const mockAxiosResponse: AxiosResponse<EmailAddressResponse[]> = {
                data: mockResponseData,
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    headers: new AxiosHeaders(),
                },
            };

            mockHttpService.get.mockReturnValueOnce(of(mockAxiosResponse));

            const result: Option<PersonEmailResponse> = await sut.findEmailBySpshPerson(mockPersonId);
            expect(result).toEqual(new PersonEmailResponse(EmailAddressStatus.ENABLED, mockEmail));
        });

        it('should return undefined when get call returns empty data', async () => {
            const mockPersonId: string = faker.string.uuid();

            mockHttpService.get.mockReturnValueOnce(of({ data: [] } as AxiosResponse));

            const result: Option<PersonEmailResponse> = await sut.findEmailBySpshPerson(mockPersonId);
            expect(result).toBeUndefined();
        });

        it('should log error and return undefined when get call fails', async () => {
            const mockPersonId: string = faker.string.uuid();
            const error: Error = new Error('Network error');
            mockHttpService.get.mockImplementation(() => {
                throw error;
            });

            const result: Option<PersonEmailResponse> = await sut.findEmailBySpshPerson(mockPersonId);
            expect(result).toBeUndefined();
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `Failed to fetch email for person ${mockPersonId}`,
                error,
            );
        });

        it('should return PersonEmailResponse when get call returns valid data', async () => {
            const mockPersonId: string = faker.string.uuid();
            const mockEmail: string = 'test@example.com';
            const mockResponseData: EmailAddressResponse[] = [
                createMock<EmailAddressResponse>(EmailAddressResponse, {
                    address: mockEmail,
                    status: EmailAddressStatusEnum.ACTIVE,
                }),
            ];
            const mockAxiosResponse: AxiosResponse<EmailAddressResponse[]> = {
                data: mockResponseData,
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    headers: new AxiosHeaders(),
                },
            };

            mockHttpService.get.mockReturnValueOnce(of(mockAxiosResponse));

            const result: Option<PersonEmailResponse> = await sut.findEmailBySpshPerson(mockPersonId);
            expect(result).toEqual(new PersonEmailResponse(EmailAddressStatus.ENABLED, mockEmail));
        });

        it('should return undefined when get call returns empty data', async () => {
            const mockPersonId: string = faker.string.uuid();

            mockHttpService.get.mockReturnValueOnce(of({ data: [] } as AxiosResponse));

            const result: Option<PersonEmailResponse> = await sut.findEmailBySpshPerson(mockPersonId);
            expect(result).toBeUndefined();
        });

        it('should log error and return undefined when get call fails', async () => {
            const mockPersonId: string = faker.string.uuid();
            const error: Error = new Error('Network error');
            mockHttpService.get.mockImplementation(() => {
                throw error;
            });

            const result: Option<PersonEmailResponse> = await sut.findEmailBySpshPerson(mockPersonId);
            expect(result).toBeUndefined();
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `Failed to fetch email for person ${mockPersonId}`,
                error,
            );
        });
    });

    describe('findEmailsBySpshPersons', () => {
        it('should return record of personId to PersonEmailResponse when post call returns valid data', async () => {
            const personId1: string = faker.string.uuid();
            const personId2: string = faker.string.uuid();
            const email1: string = 'one@example.com';
            const email2: string = 'two@example.com';

            const resp1: DeepMocked<EmailAddressResponse> = createMock<EmailAddressResponse>(EmailAddressResponse, {
                address: email1,
                status: EmailAddressStatusEnum.ACTIVE,
                spshPersonId: personId1,
            });
            const resp2: DeepMocked<EmailAddressResponse> = createMock<EmailAddressResponse>(EmailAddressResponse, {
                address: email2,
                status: EmailAddressStatusEnum.PENDING,
                spshPersonId: personId2,
            });

            const responseData: EmailAddressResponse[] = [resp1, resp2];

            const mockAxiosResponse: AxiosResponse<EmailAddressResponse[]> = {
                data: responseData,
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    headers: new AxiosHeaders(),
                },
            };

            mockHttpService.post.mockReturnValueOnce(of(mockAxiosResponse));

            const result: Result<
                Map<PersonID, PersonEmailResponse | undefined>,
                DomainError
            > = await sut.findEmailsBySpshPersons([personId1, personId2]);
            expectOkResult(result);
            expect(result.value.size).toBe(2);
            expect(result.value.get(personId1)).toEqual(new PersonEmailResponse(EmailAddressStatus.ENABLED, email1));
            expect(result.value.get(personId2)).toEqual(new PersonEmailResponse(EmailAddressStatus.REQUESTED, email2));
        });

        it('should log error and return empty map when post call fails', async () => {
            const ids: string[] = [faker.string.uuid(), faker.string.uuid()];
            const error: EmailMicroserviceCommunicationError = new EmailMicroserviceCommunicationError(
                'Communication error',
            );

            mockHttpService.post.mockImplementation(() => {
                throw error;
            });

            const result: Result<
                Map<PersonID, PersonEmailResponse | undefined>,
                DomainError
            > = await sut.findEmailsBySpshPersons(ids);

            expect(result.ok).toBeFalsy();
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(`Failed to fetch emails for persons`, error);
        });
    });

    describe('findByPrimaryAddress', () => {
        it('should return spshPersonId when get call returns valid primary email data', async () => {
            const address: string = faker.internet.email();
            const spshPersonId: string = faker.string.uuid();
            const mockResponseData: EmailAddressResponse = createMock<EmailAddressResponse>(EmailAddressResponse, {
                address: address,
                status: EmailAddressStatusEnum.ACTIVE,
                isPrimary: true,
                spshPersonId: spshPersonId,
            });

            const mockAxiosResponse: AxiosResponse<EmailAddressResponse> = {
                data: mockResponseData,
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    headers: new AxiosHeaders(),
                },
            };

            mockHttpService.get.mockReturnValueOnce(of(mockAxiosResponse));

            const result: Option<PersonIdWithEmailResponse> = await sut.findByPrimaryAddress(address);
            expect(result?.personId).toEqual(spshPersonId);
        });

        it('should return undefined when get call returns error code', async () => {
            const address: string = faker.internet.email();
            const mockResponseData: EmailAddressResponse = createMock<EmailAddressResponse>(EmailAddressResponse);

            const mockAxiosResponse: AxiosResponse<EmailAddressResponse> = {
                data: mockResponseData,
                status: 400,
                statusText: 'Bad Request',
                headers: {},
                config: {
                    headers: new AxiosHeaders(),
                },
            };

            mockHttpService.get.mockReturnValueOnce(of(mockAxiosResponse));

            const result: Option<PersonIdWithEmailResponse> = await sut.findByPrimaryAddress(address);
            expect(result).toEqual(undefined);
        });

        it('should return undefined when get call returns valid non primary email data', async () => {
            const address: string = faker.internet.email();
            const spshPersonId: string = faker.string.uuid();
            const mockResponseData: EmailAddressResponse = createMock<EmailAddressResponse>(EmailAddressResponse, {
                address: address,
                status: EmailAddressStatusEnum.ACTIVE,
                isPrimary: false,
                spshPersonId: spshPersonId,
            });

            const mockAxiosResponse: AxiosResponse<EmailAddressResponse> = {
                data: mockResponseData,
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    headers: new AxiosHeaders(),
                },
            };

            mockHttpService.get.mockReturnValueOnce(of(mockAxiosResponse));

            const result: Option<PersonIdWithEmailResponse> = await sut.findByPrimaryAddress(address);
            expect(result).toEqual(undefined);
        });

        it('should return undefined when get call returns without spshPersonId', async () => {
            const address: string = faker.internet.email();
            const mockResponseData: EmailAddressResponse = createMock<EmailAddressResponse>(EmailAddressResponse, {
                address: address,
                status: EmailAddressStatusEnum.ACTIVE,
                isPrimary: true,
                spshPersonId: undefined,
            });

            const mockAxiosResponse: AxiosResponse<EmailAddressResponse> = {
                data: mockResponseData,
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    headers: new AxiosHeaders(),
                },
            };

            mockHttpService.get.mockReturnValueOnce(of(mockAxiosResponse));

            const result: Option<PersonIdWithEmailResponse> = await sut.findByPrimaryAddress(address);
            expect(result).toEqual(undefined);
        });

        it('should log error when microservice  call throws error', async () => {
            const address: string = faker.internet.email();
            const error: Error = new Error('Network error');
            mockHttpService.get.mockImplementation(() => {
                throw new Error('Network error');
            });

            const result: Option<PersonIdWithEmailResponse> = await sut.findByPrimaryAddress(address);
            expect(result).toEqual(undefined);
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `Failed to fetch email for address ${address}`,
                error,
            );
        });
    });

    describe('findEmailBySpshPersonWithOXLoginId', () => {
        it('should return EmailAddressResponse when get call returns valid data', async () => {
            const mockPersonId: string = faker.string.uuid();
            const mockResponseData: EmailAddressResponse[] = [
                createMock<EmailAddressResponse>(EmailAddressResponse, {
                    id: faker.string.uuid(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    address: faker.internet.email(),
                    status: EmailAddressStatusEnum.ACTIVE,
                    oxLoginId: faker.string.uuid(),
                }),
            ];
            const mockAxiosResponse: AxiosResponse<EmailAddressResponse[]> = {
                data: mockResponseData,
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    headers: new AxiosHeaders(),
                },
            };

            mockHttpService.get.mockReturnValueOnce(of(mockAxiosResponse));

            const result: Result<Option<EmailAddressResponse>> =
                await sut.findEmailBySpshPersonAsEmailAddressResponse(mockPersonId);
            expectOkResult(result);
            expect(result.value).toEqual(mockResponseData[0]);
        });

        it('should return undefined when get call returns empty data', async () => {
            const mockPersonId: string = faker.string.uuid();

            mockHttpService.get.mockReturnValueOnce(of({ data: [] } as AxiosResponse));

            const result: Result<Option<EmailAddressResponse>> =
                await sut.findEmailBySpshPersonAsEmailAddressResponse(mockPersonId);
            expectOkResult(result);
            expect(result.value).toBeUndefined();
        });

        it('should log error and return undefined when get call fails', async () => {
            const mockPersonId: string = faker.string.uuid();
            const error: Error = new Error('Network error');
            mockHttpService.get.mockImplementation(() => {
                throw error;
            });

            const result: Result<Option<EmailAddressResponse>> =
                await sut.findEmailBySpshPersonAsEmailAddressResponse(mockPersonId);
            expectErrResult(result);
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `Failed to fetch email for person ${mockPersonId}`,
                error,
            );
        });
    });

    describe('setEmailForSpshPerson', () => {
        it('should send email data to microservice successfully', async () => {
            const spshPersonId: string = faker.string.uuid();
            const params: SetEmailAddressForSpshPersonBodyParams = {
                spshUsername: 'mmustermann',
                kennungen: ['0706054'],
                firstName: 'Max',
                lastName: 'Mustermann',
                spshServiceProviderId: faker.string.uuid(),
            } satisfies SetEmailAddressForSpshPersonBodyParams;
            const mockAxiosResponse: AxiosResponse<EmailAddressResponse[]> = {
                data: [],
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    headers: new AxiosHeaders(),
                },
            };
            mockHttpService.post.mockReturnValue(of(mockAxiosResponse));
            await sut.setEmailForSpshPerson({ spshPersonId: spshPersonId, ...params });

            expect(mockHttpService.post).toHaveBeenCalledWith(
                `http://localhost:9091/api/write/${spshPersonId}/set-email`,
                { ...params },
                {
                    headers: {
                        'api-key': 'api-key',
                    },
                },
            );

            expect(loggerMock.info).toHaveBeenCalledWith(
                `Setting email for person ${spshPersonId} via email microservice with spId ${params.spshServiceProviderId}`,
            );
        });

        it('should log error when microservice post call fails', async () => {
            const spshPersonId: string = faker.string.uuid();
            const params: SetEmailAddressForSpshPersonBodyParams = {
                spshUsername: 'mmustermann',
                kennungen: ['0706054'],
                firstName: 'Max',
                lastName: 'Mustermann',
                spshServiceProviderId: faker.string.uuid(),
            } satisfies SetEmailAddressForSpshPersonBodyParams;
            const error: Error = new Error('Microservice failure');

            mockHttpService.post.mockImplementation(() => {
                throw error;
            });

            await sut.setEmailForSpshPerson({ spshPersonId: spshPersonId, ...params });
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `Failed to set email for person ${spshPersonId}`,
                error,
            );
        });
    });

    describe('setEmailsSuspendedForSpshPerson', () => {
        it('should send data to microservice successfully', async () => {
            const spshPersonId: string = faker.string.uuid();
            const mockAxiosResponse: AxiosResponse<EmailAddressResponse[]> = {
                data: [],
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    headers: new AxiosHeaders(),
                },
            };
            mockHttpService.post.mockReturnValue(of(mockAxiosResponse));
            await sut.setEmailsSuspendedForSpshPerson({ spshPersonId: spshPersonId });

            expect(mockHttpService.post).toHaveBeenCalledWith(
                `http://localhost:9091/api/write/${spshPersonId}/set-suspended`,
                {},
                {
                    headers: {
                        'api-key': 'api-key',
                    },
                },
            );
            expect(loggerMock.info).toHaveBeenCalledWith(`Setting emails for person ${spshPersonId} to suspended`);
        });

        it('should log error when microservice post call fails', async () => {
            const spshPersonId: string = faker.string.uuid();
            const error: Error = new Error('Microservice failure');

            mockHttpService.post.mockImplementation(() => {
                throw error;
            });

            await sut.setEmailsSuspendedForSpshPerson({ spshPersonId: spshPersonId });
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `Failed to set emails for person ${spshPersonId} to suspended`,
                error,
            );
        });
    });

    it('should return true when USE_EMAIL_MICROSERVICE is true', () => {
        const configService: ConfigService = module.get(ConfigService);
        vi.spyOn(configService, 'getOrThrow').mockReturnValueOnce({
            USE_EMAIL_MICROSERVICE: true,
            ENDPOINT: 'http://email-service/',
        });

        expect(sut.shouldUseEmailMicroservice()).toBe(true);
    });

    it('should return false when USE_EMAIL_MICROSERVICE is false', () => {
        const configService: ConfigService = module.get(ConfigService);
        vi.spyOn(configService, 'getOrThrow').mockReturnValueOnce({
            USE_EMAIL_MICROSERVICE: false,
            ENDPOINT: 'http://email-service/',
        });

        expect(sut.shouldUseEmailMicroservice()).toBe(false);
    });

    describe('getPrimaryActiveEmailForPerson', () => {
        it('should return address when microservice is used and email is ENABLED', async () => {
            const personId: string = faker.string.uuid();
            const emailAddress: string = 'primary@example.com';
            const person: DeepMocked<Person<true>> = createMock<Person<true>>(Person, {
                id: personId,
            });

            vi.spyOn(sut, 'shouldUseEmailMicroservice').mockReturnValueOnce(true);
            vi.spyOn(sut, 'findEmailBySpshPerson').mockResolvedValueOnce(
                new PersonEmailResponse(EmailAddressStatus.ENABLED, emailAddress),
            );

            const result: string | undefined = await sut.getPrimaryActiveEmailForPerson(person);

            expect(result).toBe(emailAddress);
            expect(sut.findEmailBySpshPerson).toHaveBeenCalledWith(personId);
            expect(emailRepoMock.getEmailAddressAndStatusForPerson).not.toHaveBeenCalled();
        });

        it('should return undefined when microservice is used and email is NOT ENABLED', async () => {
            const personId: string = faker.string.uuid();
            const emailAddress: string = 'primary@example.com';
            const person: DeepMocked<Person<true>> = createMock<Person<true>>(Person, {
                id: personId,
            });

            vi.spyOn(sut, 'shouldUseEmailMicroservice').mockReturnValueOnce(true);
            vi.spyOn(sut, 'findEmailBySpshPerson').mockResolvedValueOnce(
                new PersonEmailResponse(EmailAddressStatus.DISABLED, emailAddress),
            );

            const result: string | undefined = await sut.getPrimaryActiveEmailForPerson(person);

            expect(result).toBeUndefined();
            expect(sut.findEmailBySpshPerson).toHaveBeenCalledWith(personId);
            expect(emailRepoMock.getEmailAddressAndStatusForPerson).not.toHaveBeenCalled();
        });

        it('should return undefined when microservice is used and no email is returned', async () => {
            const personId: string = faker.string.uuid();
            const person: DeepMocked<Person<true>> = createMock<Person<true>>(Person, {
                id: personId,
            });

            vi.spyOn(sut, 'shouldUseEmailMicroservice').mockReturnValueOnce(true);
            vi.spyOn(sut, 'findEmailBySpshPerson').mockResolvedValueOnce(undefined);

            const result: string | undefined = await sut.getPrimaryActiveEmailForPerson(person);

            expect(result).toBeUndefined();
            expect(sut.findEmailBySpshPerson).toHaveBeenCalledWith(personId);
            expect(emailRepoMock.getEmailAddressAndStatusForPerson).not.toHaveBeenCalled();
        });

        it('should return address when repo is used and email is ENABLED', async () => {
            const personId: string = faker.string.uuid();
            const emailAddress: string = 'primary@example.com';
            const person: DeepMocked<Person<true>> = createMock<Person<true>>(Person, {
                id: personId,
            });

            vi.spyOn(sut, 'shouldUseEmailMicroservice').mockReturnValueOnce(false);
            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(
                new PersonEmailResponse(EmailAddressStatus.ENABLED, emailAddress),
            );

            const result: string | undefined = await sut.getPrimaryActiveEmailForPerson(person);

            expect(result).toBe(emailAddress);
            expect(emailRepoMock.getEmailAddressAndStatusForPerson).toHaveBeenCalledWith(person);
        });

        it('should return undefined when repo is used and email is NOT ENABLED', async () => {
            const personId: string = faker.string.uuid();
            const emailAddress: string = 'primary@example.com';
            const person: DeepMocked<Person<true>> = createMock<Person<true>>(Person, {
                id: personId,
            });

            vi.spyOn(sut, 'shouldUseEmailMicroservice').mockReturnValueOnce(false);
            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(
                new PersonEmailResponse(EmailAddressStatus.REQUESTED, emailAddress),
            );

            const result: string | undefined = await sut.getPrimaryActiveEmailForPerson(person);

            expect(result).toBeUndefined();
            expect(emailRepoMock.getEmailAddressAndStatusForPerson).toHaveBeenCalledWith(person);
        });

        it('should return undefined when repo is used and no email is returned', async () => {
            const personId: string = faker.string.uuid();
            const person: DeepMocked<Person<true>> = createMock<Person<true>>(Person, {
                id: personId,
            });

            vi.spyOn(sut, 'shouldUseEmailMicroservice').mockReturnValueOnce(false);
            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(undefined);

            const result: string | undefined = await sut.getPrimaryActiveEmailForPerson(person);

            expect(result).toBeUndefined();
            expect(emailRepoMock.getEmailAddressAndStatusForPerson).toHaveBeenCalledWith(person);
        });
    });

    //###### Tests for private functions ######

    it('should use correct endpoint from config in post call', async () => {
        const spshPersonId: string = faker.string.uuid();
        const params: SetEmailAddressForSpshPersonBodyParams = {
            spshUsername: 'mmustermann',
            kennungen: ['0706054'],
            firstName: 'Max',
            lastName: 'Mustermann',
            spshServiceProviderId: faker.string.uuid(),
        } satisfies SetEmailAddressForSpshPersonBodyParams;

        mockHttpService.post.mockReturnValueOnce(of({ status: 200 } as AxiosResponse));

        await sut.setEmailForSpshPerson({ spshPersonId: spshPersonId, ...params });

        expect(mockHttpService.post).toHaveBeenCalledWith(
            expect.stringMatching(/\/api\/write\/[a-f0-9-]+\/set-email$/),
            { ...params },
            {
                headers: {
                    'api-key': 'api-key',
                },
            },
        );
    });

    it.each([
        [EmailAddressStatusEnum.PENDING, EmailAddressStatus.REQUESTED],
        [EmailAddressStatusEnum.ACTIVE, EmailAddressStatus.ENABLED],
        [EmailAddressStatusEnum.DEACTIVE, EmailAddressStatus.DISABLED],
        [EmailAddressStatusEnum.SUSPENDED, EmailAddressStatus.DISABLED],
        [EmailAddressStatusEnum.TO_BE_DELETED, EmailAddressStatus.DELETED],
        [EmailAddressStatusEnum.FAILED, EmailAddressStatus.FAILED],
        [EmailAddressStatusEnum.EXISTS_ONLY_IN_OX, EmailAddressStatus.FAILED],
    ])('should map %s to %s', async (inputStatus: EmailAddressStatusEnum, expectedStatus: EmailAddressStatus) => {
        const mockPersonId: string = faker.string.uuid();
        const mockOxLoginId: string = faker.string.uuid();
        const mockEmail: string = 'test@example.com';
        const mockAxiosResponse: AxiosResponse<EmailAddressResponse[]> = {
            data: [
                {
                    address: mockEmail,
                    status: inputStatus,
                    id: faker.string.uuid(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    oxLoginId: mockOxLoginId,
                    isPrimary: true,
                },
            ],
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {
                headers: new AxiosHeaders(),
            },
        };

        mockHttpService.get.mockReturnValueOnce(of(mockAxiosResponse));

        const result: Option<PersonEmailResponse> = await sut.findEmailBySpshPerson(mockPersonId);
        expect(result).toEqual(new PersonEmailResponse(expectedStatus, mockEmail));
    });

    it('should map unknown status to DISABLED (default case)', async () => {
        const mockPersonId: string = faker.string.uuid();
        const mockOxLoginId: string = faker.string.uuid();
        const mockEmail: string = 'test@example.com';
        const invalidStatus: EmailAddressStatusEnum = 'UNKNOWN_STATUS' as EmailAddressStatusEnum;
        const mockAxiosResponse: AxiosResponse<EmailAddressResponse[]> = {
            data: [
                {
                    address: mockEmail,
                    status: invalidStatus,
                    id: faker.string.uuid(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    oxLoginId: mockOxLoginId,
                    isPrimary: true,
                },
            ],
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {
                headers: new AxiosHeaders(),
            },
        };

        mockHttpService.get.mockReturnValueOnce(of(mockAxiosResponse));

        const result: Option<PersonEmailResponse> = await sut.findEmailBySpshPerson(mockPersonId);
        expect(result).toEqual(new PersonEmailResponse(EmailAddressStatus.DISABLED, mockEmail));
    });

    describe('deleteEmailsForSpshPerson', () => {
        it('should call httpService.delete with correct URL and log info', async () => {
            const spshPersonId: string = faker.string.uuid();

            mockHttpService.delete.mockReturnValueOnce(of({ status: 200 } as AxiosResponse));

            await sut.deleteEmailsForSpshPerson({ spshPersonId });

            expect(loggerMock.info).toHaveBeenCalledWith(
                `Deleting email for person ${spshPersonId} via email microservice`,
            );
            expect(mockHttpService.delete).toHaveBeenCalledWith(
                `http://localhost:9091/api/write/${spshPersonId}/delete-emails`,
                {
                    headers: {
                        'api-key': 'api-key',
                    },
                },
            );
        });

        it('should log error when httpService.delete throws', async () => {
            const spshPersonId: string = faker.string.uuid();
            const error: Error = new Error('Microservice failure');
            mockHttpService.delete.mockImplementation(() => {
                throw error;
            });

            await sut.deleteEmailsForSpshPerson({ spshPersonId });

            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `Failed to delete emails for person ${spshPersonId}`,
                error,
            );
        });
    });
});
