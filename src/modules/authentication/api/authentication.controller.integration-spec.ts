import { faker } from '@faker-js/faker';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Request, type Response } from 'express';
import { type SessionData } from 'express-session';
import { type Client, type EndSessionParameters, type IssuerMetadata } from 'openid-client';
import { type Mock, type MockedObject, vi } from 'vitest';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';

import { MikroORM } from '@mikro-orm/core';
import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { createRequestMock, createResponseMock } from '../../../../test/utils/http.mocks.js';
import {
    createOidcClientMock,
    createPassportUserMock,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DoFactory,
} from '../../../../test/utils/index.js';
import { type FrontendConfig } from '../../../shared/config/frontend.config.js';
import { type KeycloakConfig } from '../../../shared/config/keycloak.config.js';
import { EmailMicroserviceModule } from '../../email-microservice/email-microservice.module.js';
import { KeycloakUserService } from '../../keycloak-administration/index.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import PersonTimeLimitService from '../../person/domain/person-time-limit-info.service.js';
import { TimeLimitOccasion } from '../../person/domain/time-limit-occasion.enums.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { PersonModule } from '../../person/person.module.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonenKontextModule } from '../../personenkontext/personenkontext.module.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RolleModule } from '../../rolle/rolle.module.js';
import { ServiceProviderModule } from '../../service-provider/service-provider.module.js';
import { PersonPermissionsRepo } from '../domain/person-permission.repo.js';
import { type PersonenkontextRolleWithOrganisation, type PersonPermissions } from '../domain/person-permissions.js';
import { UserExternaldataWorkflowFactory } from '../domain/user-extenaldata.factory.js';
import { CsrfTokenService } from '../services/csrf-token.service.js';
import { OIDC_CLIENT } from '../services/oidc-client.service.js';
import { type PassportUser } from '../types/user.js';
import { AuthenticationController } from './authentication.controller.js';
import { CsrfTokenResponse } from './csrf-token.response.js';
import { UserinfoResponse } from './userinfo.response.js';

describe('AuthenticationController', () => {
    let module: TestingModule;
    let authController: AuthenticationController;
    let oidcClient: DeepMocked<Client>;
    let frontendConfig: FrontendConfig;
    const keycloakUserServiceMock: DeepMocked<KeycloakUserService> = createMock(KeycloakUserService);
    let keyCloakConfig: KeycloakConfig;
    const personTimeLimitServiceMock: DeepMocked<PersonTimeLimitService> = createMock(PersonTimeLimitService);
    const csrfTokenServiceMock: DeepMocked<CsrfTokenService> = createMock(CsrfTokenService);
    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                CommonTestModule,
                ServiceProviderModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                PersonModule,
                PersonenKontextModule,
                RolleModule,
                EmailMicroserviceModule,
            ],
            providers: [
                AuthenticationController,
                UserExternaldataWorkflowFactory,
                {
                    provide: PersonPermissionsRepo,
                    useValue: createMock(PersonPermissionsRepo),
                },
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: OIDC_CLIENT,
                    useValue: createOidcClientMock(),
                },
                {
                    provide: KeycloakUserService,
                    useValue: keycloakUserServiceMock,
                },
                {
                    provide: PersonTimeLimitService,
                    useValue: personTimeLimitServiceMock,
                },
                {
                    provide: CsrfTokenService,
                    useValue: csrfTokenServiceMock,
                },
            ],
        })
            .overrideProvider(PersonRepository)
            .useValue(createMock(PersonRepository))
            .overrideProvider(DBiamPersonenkontextRepo)
            .useValue(createMock(DBiamPersonenkontextRepo))
            .compile();

        await DatabaseTestModule.setupDatabase(module.get(MikroORM));

        authController = module.get(AuthenticationController);
        oidcClient = module.get(OIDC_CLIENT);
        frontendConfig = module.get(ConfigService).getOrThrow<FrontendConfig>('FRONTEND');
        keyCloakConfig = module.get(ConfigService).getOrThrow<KeycloakConfig>('KEYCLOAK');
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    afterAll(async () => {
        const orm: MikroORM = module.get(MikroORM);

        await orm.close(true);
        await module.close();
    });

    it('should be defined', () => {
        expect(authController).toBeDefined();
    });

    describe('Login', () => {
        it('should redirect', () => {
            const responseMock: Response = createResponseMock();
            const session: SessionData = { cookie: { originalMaxAge: 0 } };

            authController.login(responseMock, session);

            expect(responseMock.redirect).toHaveBeenCalled();
        });

        it('should redirect to saved redirectUrl', () => {
            const responseMock: Response = createResponseMock();
            const user: { redirect_uri: string } = { redirect_uri: faker.internet.url() };
            const passport: { user: { redirect_uri: string } } = { user: user };
            const sessionMock: SessionData = {
                redirectUrl: passport.user.redirect_uri,
                passport: passport,
                cookie: { originalMaxAge: 0 },
            };

            authController.login(responseMock, sessionMock);

            expect(responseMock.redirect).toHaveBeenCalledWith(sessionMock.redirectUrl);
        });
    });

    describe('Logout', () => {
        function setupRequest(passportUser?: PassportUser, logoutErr?: Error, destroyErr?: Error): Request {
            const requestMock: MockedObject<Request> = createRequestMock({
                passportUser,
            });
            (requestMock.logout as Mock).mockImplementation((cb: (err: unknown) => void): void => {
                cb(logoutErr);
            });
            (requestMock.session.destroy as Mock).mockImplementation((cb: (err: unknown) => void): void => {
                cb(destroyErr);
            });
            // sessionMock.destroy.mockImplementationOnce((cb: (err: unknown) => void): Session => {
            //     cb(destroyErr);
            //     return sessionMock;
            // });

            return requestMock;
        }

        it('should call request.logout', () => {
            const requestMock: Request = setupRequest();
            oidcClient.issuer.metadata = {} as IssuerMetadata;

            authController.logout(requestMock, createResponseMock());

            expect(requestMock.logout).toHaveBeenCalled();
        });

        it('should call session.destroy', () => {
            const requestMock: Request = setupRequest();
            oidcClient.issuer.metadata = {} as IssuerMetadata;

            authController.logout(requestMock, createResponseMock());

            expect(requestMock.logout).toHaveBeenCalled();
        });

        describe('when end_session_endpoint is defined', () => {
            it('should call endSessionUrl with correct params', () => {
                const user: PassportUser = createPassportUserMock();
                const requestMock: Request = setupRequest(user);
                oidcClient.issuer.metadata = { end_session_endpoint: faker.internet.url() } as IssuerMetadata;

                authController.logout(requestMock, createResponseMock());

                expect(oidcClient.endSessionUrl).toHaveBeenCalledWith<[EndSessionParameters]>({
                    id_token_hint: user.id_token,
                    post_logout_redirect_uri: frontendConfig.LOGOUT_REDIRECT,
                    client_id: oidcClient.metadata.client_id,
                });
            });

            it('should redirect to return value of endSessionUrl', () => {
                const user: PassportUser = createPassportUserMock();
                const requestMock: Request = setupRequest(user);
                const responseMock: Response = createResponseMock();
                oidcClient.issuer.metadata = { end_session_endpoint: faker.internet.url() } as IssuerMetadata;
                const endSessionUrl: string = faker.internet.url();
                oidcClient.endSessionUrl.mockReturnValueOnce(endSessionUrl);

                authController.logout(requestMock, responseMock);

                expect(responseMock.redirect).toHaveBeenCalledWith(endSessionUrl);
            });
        });

        describe('when end_session_endpoint is not defined', () => {
            it('should return to redirectUrl param', () => {
                const requestMock: Request = setupRequest();
                const responseMock: Response = createResponseMock();
                oidcClient.issuer.metadata = { end_session_endpoint: undefined } as IssuerMetadata;

                authController.logout(requestMock, responseMock);

                expect(responseMock.redirect).toHaveBeenCalledWith(frontendConfig.LOGOUT_REDIRECT);
            });
        });

        describe('when request.logout fails', () => {
            it('should not throw error', () => {
                const requestMock: Request = setupRequest(undefined, new Error());

                expect(() => authController.logout(requestMock, createResponseMock())).not.toThrow();
            });
        });

        describe('when session.destroy fails', () => {
            it('should not throw error', () => {
                const requestMock: Request = setupRequest(undefined, undefined, new Error());

                expect(() => authController.logout(requestMock, createResponseMock())).not.toThrow();
            });
        });
    });

    describe('info', () => {
        function setupRequest(passportUser?: PassportUser): Request {
            const requestMock: MockedObject<Request> = createRequestMock({
                passportUser,
            });
            return requestMock;
        }

        it('should return user info', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock({
                updatedAt: new Date(Date.now()),
            });
            permissions.getRoleIds.mockResolvedValue([]);
            permissions.getPersonenkontexteWithRolesAndOrgs.mockImplementation(
                (): Promise<PersonenkontextRolleWithOrganisation[]> =>
                    Promise.resolve([
                        {
                            organisation: DoFactory.createOrganisation(true),
                            rolle: { systemrechte: [RollenSystemRecht.PERSONEN_VERWALTEN], serviceProviderIds: [] },
                        },
                    ]),
            );

            keycloakUserServiceMock.getLastPasswordChange.mockResolvedValueOnce({
                ok: true,
                value: faker.date.past(),
            });

            personTimeLimitServiceMock.getPersonTimeLimitInfo.mockResolvedValueOnce([
                {
                    occasion: TimeLimitOccasion.KOPERS,
                    deadline: faker.date.future(),
                },
            ]);

            const requestMock: Request = setupRequest();
            const result: UserinfoResponse = await authController.info(permissions, requestMock);

            expect(result).toBeInstanceOf(UserinfoResponse);
        });
    });

    describe('ResetPassword', () => {
        it('should redirect to the correct Keycloak URL', () => {
            const responseMock: Response = createResponseMock();
            const redirectUrl: string = faker.internet.url();
            const loginHint: string = faker.internet.username();
            authController.resetPassword(redirectUrl, loginHint, responseMock);
            const keyCloakRealm: string = keyCloakConfig.REALM_NAME.toLowerCase();
            const expectedUrl: string = `${oidcClient.issuer.metadata.authorization_endpoint}?client_id=${keyCloakRealm}&login_hint=${loginHint}&response_type=code&scope=openid&kc_action=UPDATE_PASSWORD&redirect_uri=${redirectUrl}`;
            expect(responseMock.redirect).toHaveBeenCalledWith(expectedUrl);
        });
    });

    describe('getCsrfToken', () => {
        function setupRequest(isAuthenticated: boolean, csrfToken?: string): Request {
            const requestMock: MockedObject<Request> = createRequestMock();
            requestMock.isAuthenticated.mockReturnValue(isAuthenticated);
            if (csrfToken) {
                requestMock.session.csrfToken = csrfToken;
            }
            return requestMock;
        }

        describe('when user is not authenticated', () => {
            it('should throw UnauthorizedException', () => {
                const requestMock: Request = setupRequest(false);

                expect(() => authController.getCsrfToken(requestMock)).toThrow(UnauthorizedException);
            });
        });

        describe('when user is authenticated and session has existing token', () => {
            it('should return existing token from session', () => {
                const existingToken: string = faker.string.alphanumeric(32);
                const requestMock: Request = setupRequest(true, existingToken);

                const result: CsrfTokenResponse = authController.getCsrfToken(requestMock);

                expect(result).toBeInstanceOf(CsrfTokenResponse);
                expect(result.csrfToken).toBe(existingToken);
            });
        });

        describe('when user is authenticated and session has no token', () => {
            it('should generate and return a new token', () => {
                const newToken: string = faker.string.alphanumeric(32);
                const requestMock: Request = setupRequest(true);
                const csrfTokenService: DeepMocked<CsrfTokenService> = module.get(CsrfTokenService);
                csrfTokenService.generateToken.mockReturnValueOnce(newToken);

                const result: CsrfTokenResponse = authController.getCsrfToken(requestMock);

                expect(result).toBeInstanceOf(CsrfTokenResponse);
                expect(result.csrfToken).toBe(newToken);
            });
        });

        describe('when token generation throws', () => {
            it('should throw InternalServerErrorException', () => {
                const requestMock: Request = setupRequest(true);
                const csrfTokenService: DeepMocked<CsrfTokenService> = module.get(CsrfTokenService);
                csrfTokenService.generateToken.mockImplementationOnce(() => {
                    throw new Error('Generation failed');
                });

                expect(() => authController.getCsrfToken(requestMock)).toThrow(InternalServerErrorException);
            });
        });
    });
});
