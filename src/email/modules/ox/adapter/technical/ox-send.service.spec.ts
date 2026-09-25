import { faker } from '@faker-js/faker';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import assert from 'assert';
import { AxiosResponse } from 'axios';
import { plainToInstance } from 'class-transformer';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { createMock, DeepMocked } from '../../../../../../test/utils/createMock.js';
import { EmailConfigTestModule } from '../../../../../../test/utils/index.js';
import { ClassLogger } from '../../../../../core/logging/class-logger.js';
import { EmailAppConfig } from '../../../../../shared/config/email-app.config.js';
import { DomainError } from '../../../../../shared/error/index.js';
import { OxError } from '../../../../../shared/error/ox.error.js';
import { OxMemberAlreadyInGroupError } from '../domain/error/ox-member-already-in-group.error.js';
import { OxPrimaryMailNotEqualEmail1Error } from '../domain/error/ox-primary-mail-not-equal-email1.error.js';
import { AddMemberToGroupAction } from './actions/group/add-member-to-group.action.js';
import { OxBaseAction } from './actions/ox-base-action.js';
import { OxErrorType, OxSendService } from './ox-send.service.js';

class MockAction extends OxBaseAction<unknown, string> {
    public override action: string = 'http://soap.admin.openexchange.com/mockAction';
    public override soapServiceName: string = 'OXMockService';

    public constructor() {
        super();
    }

    public override buildRequest(): object {
        return {};
    }
    public override parseBody(): Result<string, DomainError> {
        return { ok: true, value: 'message' };
    }
}

describe('OxServiceConstructor', () => {
    it('should set default retries', () => {
        const config: EmailAppConfig = plainToInstance(EmailAppConfig, { OX: {} });

        const sut: OxSendService = new OxSendService({} as HttpService, {} as ClassLogger, config);

        expect((sut as unknown as { max_retries: number }).max_retries).toBe(3);
    });
});

describe('OxSendService', () => {
    let module: TestingModule;
    let sut: OxSendService;

    let httpServiceMock: DeepMocked<HttpService>;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [EmailConfigTestModule],
            providers: [
                OxSendService,
                {
                    provide: HttpService,
                    useValue: createMock(HttpService),
                },
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
            ],
        }).compile();

        sut = module.get(OxSendService);
        httpServiceMock = module.get(HttpService);
        loggerMock = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('send', () => {
        it('should call HttpService.post', async () => {
            const mockAction: DeepMocked<OxBaseAction<unknown, unknown>> = createMock(AddMemberToGroupAction);
            mockAction.buildRequest.mockReturnValueOnce({});
            mockAction.parseResponse.mockReturnValueOnce({ ok: true, value: 'TestResult' });
            mockAction.action = 'testAction';
            mockAction.soapServiceName = 'TestService';
            httpServiceMock.post.mockReturnValueOnce(of({} as AxiosResponse));

            await sut.send(mockAction);

            expect(httpServiceMock.post).toHaveBeenCalledWith(
                'https://ox_ip:ox_port/webservices/TestService',
                expect.stringContaining('username'),
                {
                    headers: {
                        'Content-Type': 'text/xml;charset=UTF-8',
                        SOAPAction: `"testAction"`,
                    },
                },
            );
        });

        it('should call parseResponse of action and return result', async () => {
            const mockAction: DeepMocked<MockAction> = createMock(MockAction);
            mockAction.buildRequest.mockReturnValueOnce({});
            mockAction.parseResponse.mockReturnValueOnce({ ok: true, value: 'TestResult' });
            mockAction.action = 'testAction';
            mockAction.soapServiceName = 'TestService';

            httpServiceMock.post.mockReturnValueOnce(of({} as AxiosResponse));

            const result: Result<string, DomainError> = await sut.send(mockAction);

            expect(result).toEqual({
                ok: true,
                value: 'TestResult',
            });
        });

        it('should return result if a retry succeeds', async () => {
            vi.useFakeTimers();
            const mockAction: DeepMocked<MockAction> = createMock(MockAction);
            mockAction.buildRequest.mockReturnValueOnce({});
            mockAction.parseResponse.mockReturnValueOnce({ ok: true, value: 'TestResult' });
            mockAction.action = 'testAction';
            mockAction.soapServiceName = 'TestService';

            const error: Error = new Error('AxiosError');
            httpServiceMock.post.mockReturnValueOnce(throwError(() => error)); // Fail first
            httpServiceMock.post.mockReturnValueOnce(of({} as AxiosResponse)); // Succeed on retry

            const resultPromise: Promise<Result<string, DomainError>> = sut.send(mockAction);
            await vi.runAllTimersAsync();
            const result: Result<string, DomainError> = await resultPromise;

            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                'Attempt 1 failed. Retrying in 15000ms... Remaining retries: 1',
                expect.any(Error),
            );
            expect(result).toEqual({
                ok: true,
                value: 'TestResult',
            });
        });

        it('should return OxError if request failed and response is NOT a specific OX-Error-response', async () => {
            vi.useFakeTimers();
            const error: Error = new Error('AxiosError');
            const mockAction: DeepMocked<MockAction> = createMock(MockAction);
            httpServiceMock.post.mockReturnValueOnce(throwError(() => error));
            httpServiceMock.post.mockReturnValueOnce(throwError(() => error)); // Retry

            const resultPromise: Promise<Result<string, DomainError>> = sut.send(mockAction);
            await vi.runAllTimersAsync();
            const result: Result<string, DomainError> = await resultPromise;

            expect(result).toEqual({
                ok: false,
                error: new OxError('Request failed'),
            });
        });

        it('should return specific OxError and log error if request failed and response is a specific OX-Error-response', async () => {
            vi.useFakeTimers();
            const faultString: string = 'primarymail must have the same value as email1; exceptionId 1826201806-2';
            const error: OxErrorType = {
                message: faker.string.alphanumeric(),
                code: faker.string.numeric(),
                response: {
                    status: 500,
                    statusText: 'statusText',
                    data:
                        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
                        '<soap:Body>' +
                        '<soap:Fault>' +
                        '<faultcode>soap:Server</faultcode>' +
                        '<faultstring>' +
                        faultString +
                        '</faultstring>' +
                        '</soap:Fault>' +
                        '</soap:Body>' +
                        '</soap:Envelope>',
                },
            };

            const mockAction: DeepMocked<MockAction> = createMock(MockAction);
            httpServiceMock.post.mockReturnValueOnce(throwError(() => error));
            httpServiceMock.post.mockReturnValueOnce(throwError(() => error)); // Retry

            const resultPromise: Promise<Result<string, DomainError>> = sut.send(mockAction);
            await vi.runAllTimersAsync();
            const result: Result<string, DomainError> = await resultPromise;

            expect(result).toEqual({
                ok: false,
                error: new OxPrimaryMailNotEqualEmail1Error(faultString),
            });
        });

        it('should return specific general OxError and log error if request failed and response could NOT be parsed', async () => {
            vi.useFakeTimers();
            const faultyErrorWithMissingFaultString: OxErrorType = {
                message: faker.string.alphanumeric(),
                code: faker.string.numeric(),
                response: {
                    status: 500,
                    statusText: 'statusText',
                    data:
                        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
                        '<soap:Body>' +
                        '<soap:Fault>' +
                        '<faultcode>soap:Server</faultcode>' +
                        '</soap:Fault>' +
                        '</soap:Body>' +
                        '</soap:Envelope>',
                },
            };

            const mockAction: DeepMocked<MockAction> = createMock(MockAction);
            httpServiceMock.post.mockReturnValueOnce(throwError(() => faultyErrorWithMissingFaultString));
            httpServiceMock.post.mockReturnValueOnce(throwError(() => faultyErrorWithMissingFaultString)); // Retry

            const resultPromise: Promise<Result<string, DomainError>> = sut.send(mockAction);
            await vi.runAllTimersAsync();
            const result: Result<string, DomainError> = await resultPromise;

            expect(loggerMock.error).toHaveBeenCalledWith(`OX-response could not be parsed after error occurred`);
            expect(result).toEqual({
                ok: false,
                error: new OxError('OX-Response Could Not Be Parsed'),
            });
        });

        it('should skip retry for non-retryable errors', async () => {
            const faultString: string = 'Member already exists in group; exceptionId -483860422-666';
            const error: OxErrorType = {
                message: faker.string.alphanumeric(),
                code: faker.string.numeric(),
                response: {
                    status: 500,
                    statusText: 'statusText',
                    data:
                        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
                        '<soap:Body>' +
                        '<soap:Fault>' +
                        '<faultcode>soap:Server</faultcode>' +
                        '<faultstring>' +
                        faultString +
                        '</faultstring>' +
                        '</soap:Fault>' +
                        '</soap:Body>' +
                        '</soap:Envelope>',
                },
            };
            const mockAction: DeepMocked<MockAction> = createMock(MockAction);
            httpServiceMock.post.mockReturnValueOnce(throwError(() => error));

            const result: Result<string, DomainError> = await sut.send(mockAction);

            assert(!result.ok);
            expect(result.error).toBeInstanceOf(OxMemberAlreadyInGroupError);
            expect(result.error.message).toContain(faultString);
        });
    });
});
