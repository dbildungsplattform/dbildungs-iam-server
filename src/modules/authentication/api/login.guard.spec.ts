import { type Mock, type MockedObject } from 'vitest';
import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { type ExecutionContext } from '@nestjs/common';
import { AuthGuard, type IAuthGuard } from '@nestjs/passport';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Request } from 'express';

import { LoginGuard } from './login.guard.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { ConfigService } from '@nestjs/config';
import { type ServerConfig } from '../../../shared/config/server.config.js';
import { KeycloakUserNotFoundError } from '../domain/keycloak-user-not-found.error.js';
import { HttpFoundException } from '../../../shared/error/http.found.exception.js';
import { AuthenticationErrorI18nTypes } from './dbiam-authentication.error.js';
import { StepUpLevel } from '../passport/oidc.strategy.js';
import { createExecutionContextMock, createRequestMock } from '../../../../test/utils/http.mocks.js';
import { type Session } from 'express-session';
import { createPersonPermissionsMock, createUserinfoResponseMock } from '../../../../test/utils/auth.mock.js';
import { type UserinfoResponse } from 'openid-client';

const canActivateSpy: Mock = vi.spyOn(AuthGuard(['jwt', 'oidc']).prototype as IAuthGuard, 'canActivate');
const logInSpy: Mock = vi.spyOn(AuthGuard(['jwt', 'oidc']).prototype as IAuthGuard, 'logIn');

describe('LoginGuard', () => {
    let module: TestingModule;
    let sut: LoginGuard;
    let configMock: DeepMocked<ConfigService>;
    let logger: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                LoginGuard,
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
                {
                    provide: ConfigService<ServerConfig>,
                    useValue: createMock(ConfigService<ServerConfig>),
                },
            ],
        }).compile();

        sut = module.get(LoginGuard);
        logger = module.get(ClassLogger);
    }, 30 * 1_000);

    afterAll(async () => {
        await module.close();
    }, 30 * 1_000);

    beforeEach(() => {
        configMock = module.get(ConfigService);
        configMock.getOrThrow.mockReturnValue({
            ERROR_PAGE_REDIRECT: 'example.org/error',
            OIDC_CALLBACK_URL: 'example.org/callback',
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('canActivate', () => {
        it('should call canActivate of superclass', async () => {
            canActivateSpy.mockResolvedValueOnce(true);
            logInSpy.mockResolvedValueOnce(undefined);
            const userInfoMock: DeepMocked<UserinfoResponse> = createUserinfoResponseMock();
            userInfoMock.preferred_username = 'test';
            const requestMock: MockedObject<Request> = createRequestMock();
            requestMock.session = { requiredStepupLevel: StepUpLevel.GOLD } as unknown as Session;
            requestMock.query = { requiredStepUpLevel: StepUpLevel.GOLD };
            (requestMock.isAuthenticated as unknown as Mock).mockReturnValue(false);
            requestMock.passportUser = {
                userinfo: userInfoMock as unknown as UserinfoResponse,
                personPermissions: vi.fn().mockResolvedValue(createPersonPermissionsMock()),
            };
            const contextMock: DeepMocked<ExecutionContext> = createExecutionContextMock({ request: requestMock });

            await sut.canActivate(contextMock);

            expect(canActivateSpy).toHaveBeenCalledWith(contextMock);
        });

        it('should short-circuit out when superclass canActivate fails', async () => {
            canActivateSpy.mockResolvedValueOnce(false);
            logInSpy.mockResolvedValueOnce(undefined);
            const contextMock: DeepMocked<ExecutionContext> = createExecutionContextMock();
            (
                contextMock.switchToHttp().getRequest<DeepMocked<Request>>().isAuthenticated as unknown as Mock
            ).mockReturnValue(false);

            await expect(sut.canActivate(contextMock)).resolves.toBe(false);
        });

        it('should retry on exception', async () => {
            canActivateSpy.mockResolvedValueOnce(true);
            logInSpy.mockRejectedValueOnce('Something broke');

            const contextMock: DeepMocked<ExecutionContext> = createExecutionContextMock();
            (
                contextMock.switchToHttp().getRequest<DeepMocked<Request>>().isAuthenticated as unknown as Mock
            ).mockReturnValue(false);

            await expect(sut.canActivate(contextMock)).resolves.toBe(true);
            const request: Request = contextMock.switchToHttp().getRequest<Request>();
            expect(request.session.passport?.user.redirect_uri).not.toBeNull();
        });

        it('should call logIn of superclass', async () => {
            canActivateSpy.mockResolvedValueOnce(true);
            logInSpy.mockResolvedValueOnce(undefined);

            const userInfoMock: DeepMocked<UserinfoResponse> = createUserinfoResponseMock();
            userInfoMock.preferred_username = 'test';
            const requestMock: MockedObject<Request> = createRequestMock();
            requestMock.session = { requiredStepupLevel: StepUpLevel.GOLD } as unknown as Session;
            requestMock.query = { requiredStepUpLevel: StepUpLevel.GOLD };
            (requestMock.isAuthenticated as unknown as Mock).mockReturnValue(false);
            requestMock.passportUser = {
                userinfo: userInfoMock as unknown as UserinfoResponse,
                personPermissions: vi.fn().mockResolvedValue(createPersonPermissionsMock()),
            };
            const contextMock: DeepMocked<ExecutionContext> = createExecutionContextMock({ request: requestMock });

            await sut.canActivate(contextMock);

            expect(logInSpy).toHaveBeenCalledWith(contextMock.switchToHttp().getRequest());
        });

        it('should save returnUrl to session if it exists', async () => {
            canActivateSpy.mockResolvedValueOnce(true);
            logInSpy.mockResolvedValueOnce(undefined);
            const redirectUrl: string = faker.internet.url();

            const userInfoMock: DeepMocked<UserinfoResponse> = createUserinfoResponseMock();
            userInfoMock.preferred_username = 'test';
            const requestMock: MockedObject<Request> = createRequestMock();
            requestMock.session = { redirectUrl } as unknown as Session;
            requestMock.query = { redirectUrl };
            (requestMock.isAuthenticated as unknown as Mock).mockReturnValue(false);
            requestMock.passportUser = {
                userinfo: userInfoMock as unknown as UserinfoResponse,
                personPermissions: vi.fn().mockResolvedValue(createPersonPermissionsMock()),
            };
            const contextMock: DeepMocked<ExecutionContext> = createExecutionContextMock({ request: requestMock });

            await sut.canActivate(contextMock);

            expect(contextMock.switchToHttp().getRequest<Request>().session.redirectUrl).toBe(redirectUrl);
        });

        it('should ignore errors in super.canActivate', async () => {
            canActivateSpy.mockRejectedValueOnce(new Error());
            logInSpy.mockResolvedValueOnce(undefined);
            const userInfoMock: DeepMocked<UserinfoResponse> = createUserinfoResponseMock();
            userInfoMock.preferred_username = 'test';
            const requestMock: MockedObject<Request> = createRequestMock();
            requestMock.session = { requiredStepupLevel: StepUpLevel.GOLD } as unknown as Session;
            requestMock.query = { requiredStepUpLevel: StepUpLevel.GOLD };
            (requestMock.isAuthenticated as unknown as Mock).mockReturnValue(true);
            requestMock.passportUser = {
                userinfo: userInfoMock as unknown as UserinfoResponse,
                personPermissions: vi.fn().mockResolvedValue(createPersonPermissionsMock()),
            };
            const contextMock: DeepMocked<ExecutionContext> = createExecutionContextMock({ request: requestMock });
            await expect(sut.canActivate(contextMock)).resolves.toBe(true);
        });

        it('should ignore errors in super.logIn', async () => {
            canActivateSpy.mockResolvedValueOnce(true);
            logInSpy.mockRejectedValueOnce(new Error());

            const userInfoMock: DeepMocked<UserinfoResponse> = createUserinfoResponseMock();
            userInfoMock.preferred_username = 'test';
            const requestMock: MockedObject<Request> = createRequestMock();
            requestMock.session = { requiredStepupLevel: StepUpLevel.GOLD } as unknown as Session;
            requestMock.query = { requiredStepUpLevel: StepUpLevel.GOLD };
            (requestMock.isAuthenticated as unknown as Mock).mockReturnValue(true);
            requestMock.passportUser = {
                userinfo: userInfoMock as unknown as UserinfoResponse,
                stepUpLevel: StepUpLevel.GOLD,
                personPermissions: vi.fn().mockResolvedValue(createPersonPermissionsMock()),
            };
            const contextMock: DeepMocked<ExecutionContext> = createExecutionContextMock({ request: requestMock });

            await expect(sut.canActivate(contextMock)).resolves.toBe(true);
        });

        it('should throw HttpFoundException exception if KeycloakUser does not exist', async () => {
            configMock.getOrThrow.mockReturnValueOnce({
                ERROR_PAGE_REDIRECT: faker.internet.url(),
                OIDC_CALLBACK_URL: faker.internet.url(),
            });

            canActivateSpy.mockRejectedValueOnce(new KeycloakUserNotFoundError());
            logInSpy.mockResolvedValueOnce(undefined);

            const requestMock: MockedObject<Request> = createRequestMock();
            (requestMock.isAuthenticated as unknown as Mock).mockReturnValue(false);

            const contextMock: DeepMocked<ExecutionContext> = createExecutionContextMock({ request: requestMock });
            await expect(sut.canActivate(contextMock)).rejects.toThrow(
                new HttpFoundException({
                    DbiamAuthenticationError: {
                        code: 403,
                        i18nKey: AuthenticationErrorI18nTypes.KEYCLOAK_USER_NOT_FOUND,
                    },
                }),
            );
        });

        it('should log successful login', async () => {
            canActivateSpy.mockResolvedValueOnce(true);
            logInSpy.mockResolvedValueOnce(undefined);

            const userInfoMock: DeepMocked<UserinfoResponse> = createUserinfoResponseMock();
            userInfoMock.preferred_username = 'test';
            const requestMock: MockedObject<Request> = createRequestMock();
            requestMock.session = { requiredStepupLevel: StepUpLevel.GOLD } as unknown as Session;
            requestMock.query = { requiredStepUpLevel: StepUpLevel.GOLD };
            (requestMock.isAuthenticated as unknown as Mock).mockReturnValueOnce(false); // before login
            (requestMock.isAuthenticated as unknown as Mock).mockReturnValueOnce(true); // after login
            requestMock.passportUser = {
                userinfo: userInfoMock as unknown as UserinfoResponse,
                stepUpLevel: StepUpLevel.GOLD,
                personPermissions: vi.fn().mockResolvedValue(createPersonPermissionsMock()),
            };
            const contextMock: DeepMocked<ExecutionContext> = createExecutionContextMock({ request: requestMock });

            await sut.canActivate(contextMock);

            expect(logger.info).toHaveBeenCalledWith('Benutzer test hat sich im Schulportal angemeldet.');
        });
    });
});
