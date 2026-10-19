import { faker } from '@faker-js/faker';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { type Observable, of, throwError } from 'rxjs';
import { ConfigTestModule, DoFactory } from '../../../test/utils/index.js';
import { PersonenkontextService } from '../personenkontext/domain/personenkontext.service.js';
import { type ServiceProvider } from '../service-provider/domain/service-provider.js';
import { ServiceProviderService } from '../service-provider/domain/service-provider.service.js';
import { OTPnotValidError } from './api/error/otp-not-valid.error.js';
import { SoftwareTokenVerificationError } from './api/error/software-token-verification.error.js';
import { TokenResetError } from './api/error/token-reset.error.js';
import { PrivacyIdeaAdministrationService } from './privacy-idea-administration.service.js';
import {
    type AssignTokenResponse,
    type PrivacyIdeaToken,
    type ResetTokenResponse,
    type TokenOTPSerialResponse,
    type TokenVerificationResponse,
    type User,
    type VerificationResponse,
} from './privacy-idea-api.types.js';
import { LoggingTestModule } from '../../../test/utils/logging-test.module.js';
import { type DomainError } from '../../shared/error/domain.error.js';
import { DeleteUserError } from './api/error/delete-user.error.js';
import { SoftwareTokenInitializationError } from './api/error/software-token-initialization.error.js';
import { TokenStateError } from './api/error/token-state.error.js';
import { PIUnavailableError } from './api/error/pi-unavailable.error.js';
import { type PersonUsername } from '../../shared/types/aggregate-ids.types.js';
import { createMock, type DeepMocked } from '../../../test/utils/createMock.js';
import { type Mock } from 'vitest';

const mockErrorMsg: string = `Mock error`;

export const mockPrivacyIdeaToken: PrivacyIdeaToken = {
    active: true,
    count: 5,
    count_window: 10,
    description: 'Test token for mock data',
    failcount: 2,
    id: 12345,
    info: {
        hashlib: 'SHA-256',
        timeShift: '0',
        timeStep: '30',
        timeWindow: '5',
        tokenkind: 'software',
    },
    locked: false,
    maxfail: 3,
    otplen: 6,
    realms: ['exampleRealm'],
    resolver: 'exampleResolver',
    revoked: false,
    rollout_state: 'completed',
    serial: 'ABC123456',
    sync_window: 30,
    tokengroup: ['exampleGroup'],
    tokentype: 'TOTP',
    user_editable: true,
    user_id: 'user123',
    user_realm: 'userRealm',
    username: 'exampleUser',
};

export const mockUser: User = {
    description: 'Test user for mock data',
    editable: true,
    email: 'testuser@example.com',
    givenname: 'John',
    mobile: '+1234567890',
    phone: '+0987654321',
    resolver: 'exampleResolver',
    surname: 'Doe',
    userid: 'user123',
    username: 'johndoe',
};

export const mockVerificationResponseErrorCode905: VerificationResponse = {
    detail: null,
    id: 2,
    jsonrpc: '2.0',
    result: {
        status: false,
        error: {
            code: 905,
            message: 'Specific error message for code 905',
        },
    },
    time: 1627891255,
    version: '1.0',
    signature: 'hijklmn789012',
};

const mockJWTTokenResponse = (): Observable<AxiosResponse> =>
    of({ data: { result: { value: { token: `jwt-token` } } } } as AxiosResponse);

const mockEmptyUserResponse = (): Observable<AxiosResponse> => of({ data: { result: { value: [] } } } as AxiosResponse);

const mockUserResponse = (): Observable<AxiosResponse> =>
    of({ data: { result: { value: [mockUser] } } } as AxiosResponse);

const mockGoogleImageResponse = (): Observable<AxiosResponse> =>
    of({ data: { detail: { googleurl: { img: `base64img` } } } } as AxiosResponse);

export const mockVerificationError905Response = (): AxiosError<VerificationResponse> => {
    const error: AxiosError<VerificationResponse> = new AxiosError<VerificationResponse>(`Mock error`);
    error.response = { data: mockVerificationResponseErrorCode905 } as AxiosResponse;
    return error;
};

export const mockConnectionErrorResponse = (): AxiosError => {
    const error: AxiosError = new AxiosError(`Mock error`);
    error.code = 'ECONNREFUSED';
    return error;
};

export const mockAxiosErrorResponse = (): AxiosError => {
    const error: AxiosError = new AxiosError(`Mock error`);
    error.code = 'test-error';
    return error;
};

const mockEmptyPostResponse = (): Observable<AxiosResponse> => of({} as AxiosResponse);

const mockTokenResponse = (verify: boolean = false): Observable<AxiosResponse> => {
    if (verify) {
        const verifyToken: PrivacyIdeaToken = { ...mockPrivacyIdeaToken, rollout_state: 'verify' };
        return of({ data: { result: { value: { tokens: [verifyToken] } } } } as AxiosResponse);
    }
    return of({ data: { result: { value: { tokens: [mockPrivacyIdeaToken] } } } } as AxiosResponse);
};

export const mockVerficationTokenResponse = (status: boolean = true): Observable<AxiosResponse> =>
    of({ data: { result: { status: status } } } as AxiosResponse);

const mockErrorResponse = (): never => {
    throw new Error(mockErrorMsg);
};

const mockNonErrorThrow = (): never => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw { message: mockErrorMsg };
};

const mockTokenVerificationResponse: TokenVerificationResponse = {
    result: {
        value: {
            count: 1,
            tokens: [
                {
                    username: '',
                    active: false,
                    count: 0,
                    count_window: 0,
                    description: '',
                    failcount: 0,
                    id: 0,
                    info: {
                        hashlib: '',
                        timeShift: '',
                        timeStep: '',
                        timeWindow: '',
                        tokenkind: '',
                    },
                    locked: false,
                    maxfail: 0,
                    otplen: 0,
                    realms: [],
                    resolver: '',
                    revoked: false,
                    rollout_state: '',
                    serial: '',
                    sync_window: 0,
                    tokengroup: [],
                    tokentype: '',
                    user_id: '',
                    user_realm: '',
                },
            ],
            current: 0,
            next: null,
            prev: null,
        },
        status: false,
    },
    id: 0,
    jsonrpc: '',
    time: 0,
    version: '',
    versionnumber: '',
    signature: '',
};

const mockTokenVerificationResponseNotFound: TokenVerificationResponse = {
    result: {
        value: {
            count: 0,
            tokens: [],
            current: 0,
            next: null,
            prev: null,
        },
        status: false,
    },
    id: 0,
    jsonrpc: '',
    time: 0,
    version: '',
    versionnumber: '',
    signature: '',
};

const mockTokenVerificationResponseAlreadyAssigned: TokenVerificationResponse = {
    result: {
        value: {
            count: 1,
            tokens: [
                {
                    username: 'user123',
                    active: false,
                    count: 0,
                    count_window: 0,
                    description: '',
                    failcount: 0,
                    id: 0,
                    info: {
                        hashlib: '',
                        timeShift: '',
                        timeStep: '',
                        timeWindow: '',
                        tokenkind: '',
                    },
                    locked: false,
                    maxfail: 0,
                    otplen: 0,
                    realms: [],
                    resolver: '',
                    revoked: false,
                    rollout_state: '',
                    serial: '',
                    sync_window: 0,
                    tokengroup: [],
                    tokentype: '',
                    user_id: '',
                    user_realm: '',
                },
            ],
            current: 0,
            next: null,
            prev: null,
        },
        status: false,
    },
    id: 0,
    jsonrpc: '',
    time: 0,
    version: '',
    versionnumber: '',
    signature: '',
};

const mockTokenOTPSerialResponse: TokenOTPSerialResponse = {
    result: {
        value: {
            serial: 'ABC123456',
            count: 0,
        },
        status: false,
    },
    id: 0,
    jsonrpc: '',
    time: 0,
    version: '',
    versionnumber: '',
    signature: '',
};

const mockTokenOTPSerialResponseInvalid: TokenOTPSerialResponse = {
    result: {
        value: {
            serial: 'INVALID',
            count: 0,
        },
        status: false,
    },
    id: 0,
    jsonrpc: '',
    time: 0,
    version: '',
    versionnumber: '',
    signature: '',
};

const mockAssignTokenResponse: AssignTokenResponse = {
    id: 1,
    jsonrpc: '2.0',
    result: {
        status: true,
        value: true,
    },
    time: 1234567890,
    version: 'v1',
    versionnumber: '1.0',
    signature: 'signature',
};

describe(`PrivacyIdeaAdministrationService`, () => {
    let service: PrivacyIdeaAdministrationService;
    let httpServiceMock: DeepMocked<HttpService>;
    let serviceProviderServiceMock: DeepMocked<ServiceProviderService>;
    let personenkontextServiceMock: DeepMocked<PersonenkontextService>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [ConfigTestModule, LoggingTestModule],
            providers: [
                PrivacyIdeaAdministrationService,
                { provide: HttpService, useValue: createMock(HttpService) },
                { provide: ServiceProviderService, useValue: createMock(ServiceProviderService) },
                { provide: PersonenkontextService, useValue: createMock(PersonenkontextService) },
            ],
        }).compile();

        service = module.get<PrivacyIdeaAdministrationService>(PrivacyIdeaAdministrationService);
        httpServiceMock = module.get(HttpService);
        serviceProviderServiceMock = module.get(ServiceProviderService);
        personenkontextServiceMock = module.get(PersonenkontextService);
    });

    describe(`initializeSoftwareToken`, () => {
        it(`should initialize a software token`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockEmptyUserResponse());
            httpServiceMock.post.mockReturnValueOnce(mockEmptyPostResponse());
            httpServiceMock.post.mockReturnValueOnce(mockGoogleImageResponse());

            const result: string = await service.initializeSoftwareToken(`test-user`, false);
            expect(result).toBe(`base64img`);
        });

        it(`should initialize a software token while deleting old verify token`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(mockTokenResponse(true));
            httpServiceMock.delete.mockReturnValueOnce(of({} as AxiosResponse));
            httpServiceMock.post.mockReturnValueOnce(mockGoogleImageResponse());

            const result: string = await service.initializeSoftwareToken(`test-user`, false);
            expect(result).toBe(`base64img`);
        });

        it(`should throw an error if the jwt token request causes error throw`, async () => {
            httpServiceMock.post.mockImplementationOnce(mockErrorResponse);

            await expect(service.initializeSoftwareToken(`test-user`, false)).rejects.toThrow(
                new SoftwareTokenInitializationError(`Error fetching JWT token: ${mockErrorMsg}`),
            );
        });

        it(`should throw an error if the jwt token request causes throw`, async () => {
            httpServiceMock.post.mockImplementationOnce(mockNonErrorThrow);

            await expect(service.initializeSoftwareToken(`test-user`, false)).rejects.toThrow(
                new SoftwareTokenInitializationError(`Error fetching JWT token: Unknown error occurred`),
            );
        });

        it(`should throw an error if the check user exists request causes error throw`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockImplementationOnce(mockErrorResponse);

            await expect(service.initializeSoftwareToken(`test-user`, false)).rejects.toThrow(
                new SoftwareTokenInitializationError(`Error checking user exists: ${mockErrorMsg}`),
            );
        });

        it(`should throw an error if the check user exists request causes throw`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockImplementationOnce(mockNonErrorThrow);

            await expect(service.initializeSoftwareToken(`test-user`, false)).rejects.toThrow(
                new SoftwareTokenInitializationError(`Error checking user exists: Unknown error occurred`),
            );
        });

        it(`should throw an error if the add user request causes error throw`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockEmptyUserResponse());
            httpServiceMock.post.mockImplementationOnce(mockErrorResponse);

            await expect(service.initializeSoftwareToken(`test-user`, false)).rejects.toThrow(
                new SoftwareTokenInitializationError(`Error adding user: ${mockErrorMsg}`),
            );
        });

        it(`should throw an error if the add user exists request causes throw`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockEmptyUserResponse());
            httpServiceMock.post.mockImplementationOnce(mockNonErrorThrow);

            await expect(service.initializeSoftwareToken(`test-user`, false)).rejects.toThrow(
                new SoftwareTokenInitializationError(`Error adding user: Unknown error occurred`),
            );
        });

        it(`should throw an error if the jwt token request causes error throw`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(mockTokenResponse(true));
            httpServiceMock.delete.mockImplementationOnce(mockErrorResponse);

            await expect(service.initializeSoftwareToken(`test-user`, false)).rejects.toThrow(
                new SoftwareTokenInitializationError(`Error deleting token: ${mockErrorMsg}`),
            );
        });

        it(`should throw an error if the jwt token request causes non error throw`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(mockTokenResponse(true));
            httpServiceMock.delete.mockImplementationOnce(mockNonErrorThrow);

            await expect(service.initializeSoftwareToken(`test-user`, false)).rejects.toThrow(
                new SoftwareTokenInitializationError(`Error deleting token: Unknown error occurred`),
            );
        });

        it(`should throw an error if the 2fa token request causes error throw`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockEmptyUserResponse());
            httpServiceMock.post.mockReturnValueOnce(mockEmptyPostResponse());
            httpServiceMock.post.mockImplementationOnce(mockErrorResponse);

            await expect(service.initializeSoftwareToken(`test-user`, false)).rejects.toThrow(
                new SoftwareTokenInitializationError(`Error requesting 2fa token: ${mockErrorMsg}`),
            );
        });

        it(`should throw an error if the 2fa token request causes throw`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockEmptyUserResponse());
            httpServiceMock.post.mockReturnValueOnce(mockEmptyPostResponse());
            httpServiceMock.post.mockImplementationOnce(mockNonErrorThrow);

            await expect(service.initializeSoftwareToken(`test-user`, false)).rejects.toThrow(
                new SoftwareTokenInitializationError(`Error requesting 2fa token: Unknown error occurred`),
            );
        });

        it(`should throw an error if getJWTToken throws a non-Error object`, async () => {
            vi.spyOn(
                service as unknown as { getJWTToken: () => Promise<string> },
                'getJWTToken',
            ).mockImplementationOnce(() => {
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw 'This is a non-Error throw';
            });

            await expect(service.initializeSoftwareToken(`test-user`, false)).rejects.toThrow(
                new SoftwareTokenInitializationError(),
            );
        });
    });

    describe(`getTwoAuthState`, () => {
        it(`should get the two auth state`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(mockTokenResponse());

            const result: PrivacyIdeaToken | undefined = await service.getTwoAuthState(`test-user`);
            expect(result).toBe(mockPrivacyIdeaToken);
        });

        it(`should return undefined user non existent`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockEmptyUserResponse());

            const result: PrivacyIdeaToken | undefined = await service.getTwoAuthState(`test-user`);
            expect(result).toBe(undefined);
        });

        it(`should throw an error if the user token request causes error throw`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockImplementationOnce(mockErrorResponse);

            await expect(service.getTwoAuthState(`test-user`)).rejects.toThrow(
                new TokenStateError(`Error getting user tokens: ${mockErrorMsg}`),
            );
        });

        it(`should throw an error if the user token request causes non error throw`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockImplementationOnce(mockNonErrorThrow);

            await expect(service.getTwoAuthState(`test-user`)).rejects.toThrow(
                new TokenStateError(`Error getting user tokens: Unknown error occurred`),
            );
        });

        it(`should throw an error if the getUserTokens causes non error throw`, async () => {
            vi.spyOn(
                service as unknown as { getUserTokens: () => Promise<string> },
                'getUserTokens',
            ).mockImplementationOnce(() => {
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw 'This is a non-Error throw';
            });

            await expect(service.getTwoAuthState(`test-user`)).rejects.toThrow(new TokenStateError());
        });

        it(`should throw an PIUnavailableError if jwt call to PI causes axios error with ECONNREFUSED code `, async () => {
            httpServiceMock.post.mockReturnValueOnce(throwError(() => mockConnectionErrorResponse()));

            await expect(service.getTwoAuthState(`test-user`)).rejects.toThrow(new PIUnavailableError());
        });

        it(`should throw an PIUnavailableError if user exists call to PI causes axios error with ECONNREFUSED code `, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(throwError(() => mockConnectionErrorResponse()));

            await expect(service.getTwoAuthState(`test-user`)).rejects.toThrow(new PIUnavailableError());
        });

        it(`should throw an PIUnavailableError if user tokens call to PI causes axios error with ECONNREFUSED code `, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(throwError(() => mockConnectionErrorResponse()));

            await expect(service.getTwoAuthState(`test-user`)).rejects.toThrow(new PIUnavailableError());
        });

        it(`should throw an error if call to PI causes axios error with test code `, async () => {
            httpServiceMock.post.mockReturnValueOnce(throwError(() => mockAxiosErrorResponse()));

            await expect(service.getTwoAuthState(`test-user`)).rejects.toThrow(
                new TokenStateError(`Error fetching JWT token: ${mockErrorMsg}`),
            );
        });
    });

    describe('resetToken', () => {
        const mockResetUser: string = 'testUser';
        const mockJWTToken: string = 'mockJWTToken';
        const mockTwoAuthState: PrivacyIdeaToken = {
            info: { tokenkind: 'hardware' },
        } as PrivacyIdeaToken;

        const mockResetTokenResponse: ResetTokenResponse = {} as ResetTokenResponse;

        it('should reset token successfully', async () => {
            vi.spyOn(service as unknown as { getJWTToken: () => Promise<string> }, 'getJWTToken').mockResolvedValueOnce(
                mockJWTToken,
            );
            vi.spyOn(
                service as unknown as { getTwoAuthState: (user: string) => Promise<PrivacyIdeaToken | null> },
                'getTwoAuthState',
            ).mockResolvedValueOnce(mockTwoAuthState);
            vi.spyOn(
                service as unknown as { unassignToken: (serial: string, token: string) => Promise<ResetTokenResponse> },
                'unassignToken',
            ).mockResolvedValueOnce(mockResetTokenResponse);

            const response: ResetTokenResponse = await service.resetToken(mockResetUser);
            expect(response).toEqual(mockResetTokenResponse);
            expect(service.getTwoAuthState).toHaveBeenCalledWith(mockResetUser);
            expect(service.unassignToken).toHaveBeenCalledWith(mockTwoAuthState.serial, mockJWTToken);
        });

        it('should throw an error if twoAuthState is not found', async () => {
            vi.spyOn(service as unknown as { getJWTToken: () => Promise<string> }, 'getJWTToken').mockResolvedValueOnce(
                mockJWTToken,
            );
            vi.spyOn(
                service as unknown as { getTwoAuthState: (user: string) => Promise<PrivacyIdeaToken | null> },
                'getTwoAuthState',
            ).mockResolvedValueOnce(null);

            await expect(service.resetToken(mockResetUser)).rejects.toThrow(new TokenResetError());
        });

        it('should throw an error if unassignToken fails', async () => {
            vi.spyOn(service as unknown as { getJWTToken: () => Promise<string> }, 'getJWTToken').mockResolvedValueOnce(
                mockJWTToken,
            );
            vi.spyOn(
                service as unknown as { getTwoAuthState: (user: string) => Promise<PrivacyIdeaToken | null> },
                'getTwoAuthState',
            ).mockResolvedValueOnce(mockTwoAuthState);
            vi.spyOn(service, 'unassignToken').mockRejectedValue(new Error('unassignToken error'));

            await expect(service.resetToken(mockResetUser)).rejects.toThrow(new TokenResetError());
        });

        it('should delete token on unassing if token isnt hotp', async () => {
            const totpToken: PrivacyIdeaToken = {
                info: { tokenkind: 'software' },
            } as PrivacyIdeaToken;
            vi.spyOn(service as unknown as { getJWTToken: () => Promise<string> }, 'getJWTToken').mockResolvedValueOnce(
                mockJWTToken,
            );
            vi.spyOn(
                service as unknown as { getTwoAuthState: (user: string) => Promise<PrivacyIdeaToken | null> },
                'getTwoAuthState',
            ).mockResolvedValueOnce(totpToken);
            const deleteSpy: Mock<(serial: string) => Promise<ResetTokenResponse>> = vi
                .spyOn(
                    service as unknown as { deleteToken: (serial: string) => Promise<ResetTokenResponse> },
                    'deleteToken',
                )
                .mockResolvedValueOnce(mockResetTokenResponse);

            const response: ResetTokenResponse = await service.resetToken(mockResetUser);
            expect(response).toEqual(mockResetTokenResponse);
            expect(service.getTwoAuthState).toHaveBeenCalledWith(mockResetUser);
            expect(deleteSpy).toHaveBeenCalledWith(totpToken.serial);
        });
    });

    describe('unassignToken', () => {
        it('should unassign token successfully', async () => {
            const mockSerial: string = 'mockSerial';
            const mockToken: string = 'mockJWTToken';
            const mockResetTokenResponse: ResetTokenResponse = {} as ResetTokenResponse;
            const mockResetTokenResponsePromise: AxiosResponse<ResetTokenResponse> = {
                data: mockResetTokenResponse,
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    headers: new AxiosHeaders({ 'Content-Type': 'application/json' }),
                },
            };
            httpServiceMock.post.mockReturnValue(of(mockResetTokenResponsePromise));

            const response: ResetTokenResponse = await service.unassignToken(mockSerial, mockToken);
            expect(response).toEqual(mockResetTokenResponse);
        });

        it('should throw an error if unassignToken fails', async () => {
            const mockSerial: string = 'mockSerial';
            const mockToken: string = 'mockJWTToken';

            httpServiceMock.post.mockReturnValue(throwError(() => new Error('unassignToken error')));

            await expect(service.unassignToken(mockSerial, mockToken)).rejects.toThrow(
                'Error unassigning token: unassignToken error',
            );
        });

        it('should throw an error if unassignToken fails with non error throw', async () => {
            const mockSerial: string = 'mockSerial';
            const mockToken: string = 'mockJWTToken';

            httpServiceMock.post.mockImplementationOnce(mockNonErrorThrow);

            await expect(service.unassignToken(mockSerial, mockToken)).rejects.toThrow(
                'Error unassigning token: Unknown error occurred',
            );
        });
    });

    describe('assignHardwareToken', () => {
        let getTokenToVerifySpy: Mock;

        beforeEach(() => {
            getTokenToVerifySpy = vi
                .spyOn(
                    service as unknown as { getTokenToVerify: () => Promise<PrivacyIdeaToken | undefined> },
                    'getTokenToVerify',
                )
                .mockResolvedValue(undefined);
        });

        afterEach(() => {
            getTokenToVerifySpy.mockRestore();
            vi.restoreAllMocks();
        });

        it('should assign hardware token successfully', async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            vi.spyOn(
                service as unknown as { checkUserExists: () => Promise<boolean> },
                'checkUserExists',
            ).mockResolvedValueOnce(true);
            httpServiceMock.get.mockReturnValueOnce(of({ data: mockTokenVerificationResponse } as AxiosResponse));
            httpServiceMock.get.mockReturnValueOnce(of({ data: mockTokenOTPSerialResponse } as AxiosResponse));
            httpServiceMock.post.mockReturnValueOnce(of({ data: mockAssignTokenResponse } as AxiosResponse));
            const result: AssignTokenResponse = await service.assignHardwareToken('ABC123456', 'otp', 'test-user');
            expect(result).toEqual(mockAssignTokenResponse);
        });

        it('should assign hardware token successfully and create a new user', async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            vi.spyOn(
                service as unknown as { checkUserExists: () => Promise<boolean> },
                'checkUserExists',
            ).mockResolvedValueOnce(false);

            vi.spyOn(service as unknown as { addUser: () => Promise<void> }, 'addUser').mockResolvedValueOnce();
            httpServiceMock.get.mockReturnValueOnce(of({ data: mockTokenVerificationResponse } as AxiosResponse));
            httpServiceMock.get.mockReturnValueOnce(of({ data: mockTokenOTPSerialResponse } as AxiosResponse));
            httpServiceMock.post.mockReturnValueOnce(of({ data: mockAssignTokenResponse } as AxiosResponse));
            const result: AssignTokenResponse = await service.assignHardwareToken('ABC123456', 'otp', 'test-user');
            expect(result).toEqual(mockAssignTokenResponse);
        });

        it('should throw token-not-found error', async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            vi.spyOn(
                service as unknown as { checkUserExists: () => Promise<boolean> },
                'checkUserExists',
            ).mockResolvedValueOnce(true);
            httpServiceMock.get.mockReturnValueOnce(
                of({ data: mockTokenVerificationResponseNotFound } as AxiosResponse),
            );

            await expect(service.assignHardwareToken('INVALID_SERIAL', 'otp', 'test-user')).rejects.toThrow(
                'Die eingegebene Seriennummer konnte leider nicht gefunden werden.',
            );
        });

        it('should throw token-already-assigned error', async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            vi.spyOn(
                service as unknown as { checkUserExists: () => Promise<boolean> },
                'checkUserExists',
            ).mockResolvedValueOnce(true);
            httpServiceMock.get.mockReturnValueOnce(
                of({ data: mockTokenVerificationResponseAlreadyAssigned } as AxiosResponse),
            );

            await expect(service.assignHardwareToken('ABC123456', 'otp', 'test-user')).rejects.toThrow(
                'Die eingegebene Seriennummer wird bereits aktiv verwendet. Bitte überprüfen Sie ihre Eingabe und versuchen Sie es erneut.',
            );
        });

        it('should throw token-otp-not-valid error', async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            vi.spyOn(
                service as unknown as { checkUserExists: () => Promise<boolean> },
                'checkUserExists',
            ).mockResolvedValueOnce(true);
            httpServiceMock.get.mockReturnValueOnce(of({ data: mockTokenVerificationResponse } as AxiosResponse));
            httpServiceMock.get.mockReturnValueOnce(of({ data: mockTokenOTPSerialResponseInvalid } as AxiosResponse));

            await expect(service.assignHardwareToken('ABC123456', 'invalid-otp', 'test-user')).rejects.toThrow(
                'Ungültiger Code. Bitte versuchen Sie es erneut.',
            );
        });

        it('should throw general-token-error on verifyTokenStatus error', async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            vi.spyOn(
                service as unknown as { checkUserExists: () => Promise<boolean> },
                'checkUserExists',
            ).mockResolvedValueOnce(true);
            httpServiceMock.get.mockImplementationOnce(() => throwError(() => new Error(mockErrorMsg)));

            await expect(service.assignHardwareToken('ABC123456', 'otp', 'test-user')).rejects.toThrow(
                'Leider konnte ihr Hardware-Token aus technischen Gründen nicht aktiviert werden. Bitte versuchen Sie es zu einem späteren Zeitpunkt erneut. Falls das Problem bestehen bleibt, stellen Sie bitte eine Anfrage über den IQSH Helpdesk.--Link: https://www.secure-lernnetz.de/helpdesk/',
            );
        });

        it('should throw general-token-error on getSerialWithOTP error', async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            vi.spyOn(
                service as unknown as { checkUserExists: () => Promise<boolean> },
                'checkUserExists',
            ).mockResolvedValueOnce(true);
            httpServiceMock.get.mockReturnValueOnce(of({ data: mockTokenVerificationResponse } as AxiosResponse));
            httpServiceMock.get.mockImplementationOnce(() => throwError(() => new Error(mockErrorMsg)));

            await expect(service.assignHardwareToken('ABC123456', 'otp', 'test-user')).rejects.toThrow(
                'Leider konnte ihr Hardware-Token aus technischen Gründen nicht aktiviert werden. Bitte versuchen Sie es zu einem späteren Zeitpunkt erneut. Falls das Problem bestehen bleibt, stellen Sie bitte eine Anfrage über den IQSH Helpdesk.--Link: https://www.secure-lernnetz.de/helpdesk/',
            );
        });

        it('should throw general-token-error on assignToken error', async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            vi.spyOn(
                service as unknown as { checkUserExists: () => Promise<boolean> },
                'checkUserExists',
            ).mockResolvedValueOnce(true);

            httpServiceMock.get.mockReturnValueOnce(of({ data: mockTokenVerificationResponse } as AxiosResponse));
            httpServiceMock.get.mockReturnValueOnce(of({ data: mockTokenOTPSerialResponse } as AxiosResponse));
            httpServiceMock.post.mockImplementationOnce(() => throwError(() => new Error(mockErrorMsg)));

            await expect(service.assignHardwareToken('ABC123456', 'otp', 'test-user')).rejects.toThrow(
                'Leider konnte ihr Hardware-Token aus technischen Gründen nicht aktiviert werden. Bitte versuchen Sie es zu einem späteren Zeitpunkt erneut. Falls das Problem bestehen bleibt, stellen Sie bitte eine Anfrage über den IQSH Helpdesk.--Link: https://www.secure-lernnetz.de/helpdesk/',
            );
        });

        it('should delete verify token when requesting to assign hardware token', async () => {
            getTokenToVerifySpy.mockRestore();
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            vi.spyOn(
                service as unknown as { checkUserExists: () => Promise<boolean> },
                'checkUserExists',
            ).mockResolvedValue(true);
            httpServiceMock.get.mockReturnValueOnce(mockTokenResponse(true));
            httpServiceMock.delete.mockReturnValueOnce(of({} as AxiosResponse));
            httpServiceMock.get.mockReturnValueOnce(of({ data: mockTokenVerificationResponse } as AxiosResponse));
            httpServiceMock.get.mockReturnValueOnce(of({ data: mockTokenOTPSerialResponse } as AxiosResponse));
            httpServiceMock.post.mockImplementationOnce(() => throwError(() => new Error(mockErrorMsg)));

            await expect(service.assignHardwareToken('ABC123456', 'otp', 'test-user')).rejects.toThrow(
                'Leider konnte ihr Hardware-Token aus technischen Gründen nicht aktiviert werden. Bitte versuchen Sie es zu einem späteren Zeitpunkt erneut. Falls das Problem bestehen bleibt, stellen Sie bitte eine Anfrage über den IQSH Helpdesk.--Link: https://www.secure-lernnetz.de/helpdesk/',
            );
        });
    });

    describe(`verifyToken`, () => {
        it(`should verify token`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(mockTokenResponse(true));
            httpServiceMock.post.mockReturnValueOnce(mockVerficationTokenResponse());

            await service.verifyTokenEnrollment(`test-user`, `123456`);
        });

        it(`should throw domainerror when result status is false`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(mockTokenResponse(true));
            httpServiceMock.post.mockReturnValueOnce(mockVerficationTokenResponse(false));

            await expect(service.verifyTokenEnrollment(`test-user`, `123456`)).rejects.toThrow(
                SoftwareTokenVerificationError,
            );
        });

        it(`should throw domainerror with wrong otp`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(mockTokenResponse(true));
            httpServiceMock.post.mockReturnValueOnce(throwError(() => mockVerificationError905Response()));

            await expect(service.verifyTokenEnrollment(`test-user`, `123456`)).rejects.toThrow(OTPnotValidError);
        });

        it(`should throw error when axios error occurs`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(mockTokenResponse(true));
            httpServiceMock.post.mockReturnValueOnce(throwError(() => new AxiosError('Mock error')));

            await expect(service.verifyTokenEnrollment(`test-user`, `123456`)).rejects.toThrow(
                'Error verifying token: Mock error',
            );
        });

        it(`should throw an error if there is no token to verify`, async () => {
            vi.spyOn(
                service as unknown as { getTokenToVerify: () => Promise<PrivacyIdeaToken | undefined> },
                'getTokenToVerify',
            ).mockResolvedValueOnce(undefined);

            await expect(service.verifyTokenEnrollment(`test-user`, `123456`)).rejects.toThrow('No token to verify');
        });

        it(`should throw an error if the verify request causes error throw`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(mockTokenResponse(true));
            httpServiceMock.post.mockImplementationOnce(mockErrorResponse);

            await expect(service.verifyTokenEnrollment(`test-user`, `123456`)).rejects.toThrow(
                `Error verifying token: ${mockErrorMsg}`,
            );
        });

        it(`sshould throw an error if the tverify request causes non error throw`, async () => {
            httpServiceMock.post.mockReturnValueOnce(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValueOnce(mockUserResponse());
            httpServiceMock.get.mockReturnValueOnce(mockTokenResponse(true));
            httpServiceMock.post.mockImplementationOnce(mockNonErrorThrow);

            await expect(service.verifyTokenEnrollment(`test-user`, `123456`)).rejects.toThrow(
                `Error verifying token: Unknown error occurred`,
            );
        });
    });

    describe('requires2fa', () => {
        const personId: string = faker.string.uuid();

        beforeEach(() => {
            personenkontextServiceMock.findPersonenkontexteByPersonId.mockResolvedValueOnce([
                DoFactory.createPersonenkontext(true),
            ]);
        });
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it.each([true, false])('should return %s depending on 2fa requirement', async (requires2fa: boolean) => {
            const serviceProviders: Array<ServiceProvider<true>> = [
                DoFactory.createServiceProvider(true, { requires2fa }),
            ];
            serviceProviderServiceMock.getServiceProvidersByRolleIds.mockResolvedValueOnce(serviceProviders);

            const result: boolean = await service.requires2fa(personId);

            expect(result).toBe(requires2fa);
        });
    });

    describe('deleteUser', () => {
        const username: PersonUsername = faker.string.alpha();
        let mockJWTToken: string;
        beforeEach(() => {
            mockJWTToken = faker.string.alpha();
            vi.spyOn(service as unknown as { getJWTToken: () => Promise<string> }, 'getJWTToken').mockResolvedValueOnce(
                mockJWTToken,
            );
        });

        it(`should delete user`, async () => {
            httpServiceMock.post.mockReturnValue(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValue(mockTokenResponse());
            httpServiceMock.delete.mockReturnValue(mockEmptyPostResponse());

            await expect(service.deleteUserWrapper(username)).resolves.toEqual({ ok: true, value: undefined });
            expect(httpServiceMock.delete).toHaveBeenCalledTimes(1);
        });

        it(`should resole an DeleteUserError if the delete user causes error throw`, async () => {
            httpServiceMock.post.mockReturnValue(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValue(mockTokenResponse());
            httpServiceMock.delete.mockImplementationOnce(mockErrorResponse);

            await expect(service.deleteUserWrapper(username)).resolves.toEqual({
                ok: false,
                error: new DeleteUserError(),
            });
        });

        it(`should resole an DeleteUserError if the delete user request causes non error throw`, async () => {
            httpServiceMock.post.mockReturnValue(mockJWTTokenResponse());
            httpServiceMock.get.mockReturnValue(mockTokenResponse());
            httpServiceMock.delete.mockImplementationOnce(mockNonErrorThrow);

            await expect(service.deleteUserWrapper(username)).resolves.toEqual({
                ok: false,
                error: new DeleteUserError(),
            });
        });
    });

    describe('updateUsername', () => {
        it('should update the username successfully', async () => {
            const oldUserName: string = 'oldUser';
            const newUserName: string = 'newUser';
            const mockUserTokens: PrivacyIdeaToken[] = [mockPrivacyIdeaToken];
            const mockJWTToken: string = 'mockJWTToken';
            const mockResetTokenResponse: ResetTokenResponse = {} as ResetTokenResponse;

            vi.spyOn(service as unknown as { getJWTToken: () => Promise<string> }, 'getJWTToken').mockResolvedValueOnce(
                mockJWTToken,
            );
            vi.spyOn(
                service as unknown as { getUserTokens: () => Promise<PrivacyIdeaToken[]> },
                'getUserTokens',
            ).mockResolvedValueOnce(mockUserTokens);
            vi.spyOn(
                service as unknown as { unassignToken: (serial: string, token: string) => Promise<ResetTokenResponse> },
                'unassignToken',
            ).mockResolvedValueOnce(mockResetTokenResponse);
            vi.spyOn(
                service as unknown as { checkUserExists: () => Promise<boolean> },
                'checkUserExists',
            ).mockResolvedValueOnce(false);
            vi.spyOn(
                service as unknown as { addUser: (username: string) => Promise<void> },
                'addUser',
            ).mockResolvedValueOnce();
            vi.spyOn(
                service as unknown as {
                    assignToken: (serial: string, token: string, username: string) => Promise<AssignTokenResponse>;
                },
                'assignToken',
            ).mockResolvedValueOnce(mockAssignTokenResponse);
            vi.spyOn(
                service as unknown as { deleteUser: () => Promise<Result<void, DomainError>> },
                'deleteUser',
            ).mockResolvedValueOnce({ ok: true, value: undefined });
            const result: Result<void, DomainError> = await service.updateUsername(oldUserName, newUserName);
            expect(result.ok).toBe(true);

            expect(service['deleteUser']).toHaveBeenCalledWith(oldUserName, mockJWTToken);

            expect(service['addUser']).toHaveBeenCalledWith(newUserName);
        });

        it('should return error if new username already exists', async () => {
            const oldUserName: string = 'oldUser';
            const newUserName: string = 'newUser';

            vi.spyOn(
                service as unknown as { checkUserExists: () => Promise<boolean> },
                'checkUserExists',
            ).mockResolvedValueOnce(true);

            const result: Result<void, DomainError> = await service.updateUsername(oldUserName, newUserName);
            expect(result.ok).toBe(false);
        });

        it('should return error if deleteUser fails', async () => {
            const oldUserName: string = 'oldUser';
            const newUserName: string = 'newUser';
            const mockUserTokens: PrivacyIdeaToken[] = [mockPrivacyIdeaToken];
            const mockJWTToken: string = 'mockJWTToken';
            const mockResetTokenResponse: ResetTokenResponse = {} as ResetTokenResponse;

            vi.spyOn(service as unknown as { getJWTToken: () => Promise<string> }, 'getJWTToken').mockResolvedValueOnce(
                mockJWTToken,
            );
            vi.spyOn(
                service as unknown as { getUserTokens: () => Promise<PrivacyIdeaToken[]> },
                'getUserTokens',
            ).mockResolvedValueOnce(mockUserTokens);
            vi.spyOn(
                service as unknown as { unassignToken: (serial: string, token: string) => Promise<ResetTokenResponse> },
                'unassignToken',
            ).mockResolvedValueOnce(mockResetTokenResponse);
            vi.spyOn(
                service as unknown as { checkUserExists: () => Promise<boolean> },
                'checkUserExists',
            ).mockResolvedValueOnce(false);
            vi.spyOn(
                service as unknown as { addUser: (username: string) => Promise<void> },
                'addUser',
            ).mockResolvedValueOnce();
            vi.spyOn(
                service as unknown as {
                    assignToken: (serial: string, token: string, username: string) => Promise<AssignTokenResponse>;
                },
                'assignToken',
            ).mockResolvedValueOnce(mockAssignTokenResponse);
            httpServiceMock.delete.mockReturnValueOnce(throwError(() => new Error('Delete failed')));
            const result: Result<void, DomainError> = await service.updateUsername(oldUserName, newUserName);
            expect(result.ok).toBe(false);
        });
        it('should return ok if deleteUser was successfull ', async () => {
            const oldUserName: string = 'oldUser';
            const newUserName: string = 'newUser';
            const mockUserTokens: PrivacyIdeaToken[] = [mockPrivacyIdeaToken];
            const mockJWTToken: string = 'mockJWTToken';
            const mockResetTokenResponse: ResetTokenResponse = {} as ResetTokenResponse;

            vi.spyOn(service as unknown as { getJWTToken: () => Promise<string> }, 'getJWTToken').mockResolvedValueOnce(
                mockJWTToken,
            );
            vi.spyOn(
                service as unknown as { getUserTokens: () => Promise<PrivacyIdeaToken[]> },
                'getUserTokens',
            ).mockResolvedValueOnce(mockUserTokens);
            vi.spyOn(
                service as unknown as { unassignToken: (serial: string, token: string) => Promise<ResetTokenResponse> },
                'unassignToken',
            ).mockResolvedValueOnce(mockResetTokenResponse);
            vi.spyOn(
                service as unknown as { checkUserExists: () => Promise<boolean> },
                'checkUserExists',
            ).mockResolvedValueOnce(false);
            vi.spyOn(
                service as unknown as { addUser: (username: string) => Promise<void> },
                'addUser',
            ).mockResolvedValueOnce();
            vi.spyOn(
                service as unknown as {
                    assignToken: (serial: string, token: string, username: string) => Promise<AssignTokenResponse>;
                },
                'assignToken',
            ).mockResolvedValueOnce(mockAssignTokenResponse);
            httpServiceMock.delete.mockReturnValueOnce(of({} as AxiosResponse));
            const result: Result<void, DomainError> = await service.updateUsername(oldUserName, newUserName);
            expect(result.ok).toBe(true);
        });
    });
});
