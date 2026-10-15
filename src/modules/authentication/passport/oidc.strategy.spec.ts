import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { type AuthorizationParameters, type Client, Issuer, Strategy, TokenSet, type UserinfoResponse } from 'openid-client';

import {
    ConfigTestModule,
    createUserinfoResponseMock,
    DoFactory,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { OIDC_CLIENT } from '../services/oidc-client.service.js';
import {
    extractStepUpLevelFromJWT,
    isStepUpTimeOver,
    OpenIdConnectStrategy,
    StepUpLevel,
    updateAndGetStepUpLevel,
} from './oidc.strategy.js';
import { type PassportUser } from '../types/user.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { Person } from '../../person/domain/person.js';
import { KeycloakUserNotFoundError } from '../domain/keycloak-user-not-found.error.js';
import { type Request } from 'express';
import { sign } from 'jsonwebtoken';
import { createRequestMock } from '../../../../test/utils/http.mocks.js';
import { type Mock } from 'vitest';

describe('OpenIdConnectStrategy', () => {
    let module: TestingModule;
    let sut: OpenIdConnectStrategy;
    let openIdClient: Client;
    let personRepositoryMock: DeepMocked<PersonRepository>;

    function createPerson(params: Partial<Person<boolean>> = {}): Person<true> {
        const person: Person<true> = Person.construct(
            faker.string.uuid(),
            faker.date.past(),
            faker.date.recent(),
            faker.person.lastName(),
            faker.person.firstName(),
            '1',
            faker.lorem.word(),
            undefined,
            faker.string.uuid(),
        );

        Object.assign(person, params);

        return person;
    }

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, LoggingTestModule],
            providers: [
                OpenIdConnectStrategy,
                {
                    provide: OIDC_CLIENT,
                    useValue: new new Issuer({ issuer: 'oidc' }).Client({ client_id: 'DummyId' }),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
            ],
        }).compile();

        sut = module.get(OpenIdConnectStrategy);
        openIdClient = module.get(OIDC_CLIENT);
        personRepositoryMock = module.get(PersonRepository);
    });

    afterAll(async () => {
        await module.close();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('validate', () => {
        it('should call client.userinfo', async () => {
            vi.spyOn(openIdClient, 'userinfo').mockResolvedValueOnce(createUserinfoResponseMock());
            const request: Request = createRequestMock();
            personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(DoFactory.createPerson(true));
            await sut.validate(request, new TokenSet());

            expect(openIdClient.userinfo).toHaveBeenCalled();
        });

        it('should call client.userinfo', async () => {
            const tokenSet: TokenSet = new TokenSet({
                id_token: faker.string.alpha(32),
                access_token: faker.string.alpha(32),
                refresh_token: faker.string.alpha(32),
            });
            const userinfo: UserinfoResponse = createUserinfoResponseMock();
            vi.spyOn(openIdClient, 'userinfo').mockResolvedValueOnce(userinfo);
            const request: Request = createRequestMock();
            personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(createPerson());

            const result: AuthorizationParameters = await sut.validate(request, tokenSet);

            expect(result).toMatchObject({ ...tokenSet, userinfo });
        });

        it('should throw UnauthorizedException if userinfo fails', async () => {
            vi.spyOn(openIdClient, 'userinfo').mockRejectedValueOnce(new Error());
            const request: Request = createRequestMock();
            await expect(sut.validate(request, new TokenSet())).rejects.toThrow(UnauthorizedException);
        });

        it('should set personPermissions to return rejected promise', async () => {
            vi.spyOn(openIdClient, 'userinfo').mockResolvedValueOnce(createUserinfoResponseMock());
            personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(createPerson());
            const request: Request = createRequestMock();
            const user: AuthorizationParameters & PassportUser = await sut.validate(request, new TokenSet());

            await expect(user.personPermissions()).rejects.toThrow('Permissions not loaded');
        });

        it('should throw KeycloakUserNotFoundError if keycloak-user does not exist', async () => {
            vi.spyOn(openIdClient, 'userinfo').mockResolvedValueOnce(createUserinfoResponseMock());
            personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(undefined);
            const request: Request = createRequestMock();
            await expect(sut.validate(request, new TokenSet())).rejects.toThrow(KeycloakUserNotFoundError);
        });

        it('should revoke token if keycloak-user does not exist', async () => {
            vi.spyOn(openIdClient, 'userinfo').mockResolvedValueOnce(createUserinfoResponseMock());
            vi.spyOn(openIdClient, 'revoke').mockResolvedValueOnce(undefined);
            personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(undefined);
            const request: Request = createRequestMock();
            await expect(sut.validate(request, new TokenSet({ access_token: faker.string.alpha(32) }))).rejects.toThrow(
                KeycloakUserNotFoundError,
            );
            expect(openIdClient.revoke).toHaveBeenCalled();
        });
    });

    describe('authenticate', () => {
        let superPassportSpy: Mock;
        beforeEach(() => {
            vi.restoreAllMocks();
            superPassportSpy = vi.spyOn(Strategy.prototype, 'authenticate').mockImplementation(() => {});
        });

        it('should call super.authenticate with options', () => {
            const request: Request = createRequestMock();
            sut.authenticate(request);

            expect(superPassportSpy).toHaveBeenCalledWith(request, { acr_values: 'silver' });
        });

        it('should call super.authenticate with options', () => {
            const request: Request = createRequestMock();
            request.session.requiredStepupLevel = StepUpLevel.GOLD;
            sut.authenticate(request);

            expect(superPassportSpy).toHaveBeenCalledWith(request, { acr_values: 'gold' });
        });
    });

    const mockTime = (time: number): void => {
        vi.useFakeTimers();
        vi.setSystemTime(time);
    };

    describe('Step-Up Utilities', () => {
        afterEach(() => {
            vi.useRealTimers();
        });
        describe('isStepUpTimeOver', () => {
            it('should return false if lastRouteChangeTime is undefined', () => {
                const req: Request = { session: {} } as Request;
                const timeout: number = 10;
                expect(isStepUpTimeOver(req, timeout)).toBe(false);
            });

            it('should return true if time since lastRouteChangeTime is over the threshold', () => {
                const req: Request = { session: { lastRouteChangeTime: 1000 } } as Request;
                mockTime(1001);

                const timeout: number = 10;
                expect(isStepUpTimeOver(req, timeout)).toBe(false);
                vi.restoreAllMocks();
            });

            it('should return false if time since lastRouteChangeTime is under the threshold', () => {
                const req: Request = { session: { lastRouteChangeTime: 1000 } } as Request;
                mockTime(8000);

                const timeout: number = 10;
                expect(isStepUpTimeOver(req, timeout)).toBe(false);
                vi.restoreAllMocks();
            });
        });

        describe('updateAndGetStepUpLevel', () => {
            it('should set lastRouteChangeTime if not defined', () => {
                const req: Request = { session: {} } as Request;
                const currentTime: number = 5000;
                mockTime(currentTime);
                const timeout: number = 10;

                updateAndGetStepUpLevel(req, timeout);

                expect(req.session.lastRouteChangeTime).toBe(currentTime);
                vi.restoreAllMocks();
            });

            it('should reset stepUpLevel if step-up time is over', () => {
                const req: Request = {
                    session: { lastRouteChangeTime: 1000 },
                    passportUser: { stepUpLevel: StepUpLevel.GOLD },
                } as Request;
                mockTime(12000);
                const timeout: number = 10;

                const result: StepUpLevel = updateAndGetStepUpLevel(req, timeout);

                expect(req.passportUser!.stepUpLevel).toBe(StepUpLevel.SILVER);
                expect(result).toBe(StepUpLevel.SILVER);
                expect(req.session.lastRouteChangeTime).toBe(12000);
                vi.restoreAllMocks();
            });

            it('should not set stepUpLevel if step-up time is over but passportUser is undefined', () => {
                const req: Request = {
                    session: { lastRouteChangeTime: 1000 },
                } as Request;
                mockTime(12000);
                const timeout: number = 10;

                const result: StepUpLevel = updateAndGetStepUpLevel(req, timeout);

                expect(req.passportUser).toBeUndefined();
                expect(result).toBe(StepUpLevel.SILVER);
                expect(req.session.lastRouteChangeTime).toBe(12000);
                vi.restoreAllMocks();
            });

            it('should not reset stepUpLevel if step-up time is not over', () => {
                const req: Request = {
                    session: { lastRouteChangeTime: 1000 },
                    passportUser: { stepUpLevel: StepUpLevel.GOLD },
                } as Request;
                mockTime(8000);
                const timeout: number = 10;

                const result: StepUpLevel = updateAndGetStepUpLevel(req, timeout);

                expect(req.passportUser!.stepUpLevel).toBe(StepUpLevel.GOLD);
                expect(result).toBe(StepUpLevel.GOLD);
                expect(req.session.lastRouteChangeTime).toBe(8000);
                vi.restoreAllMocks();
            });

            it('should return lowest step-up level if passportUser is undefined', () => {
                const req: Request = { session: {} } as Request;
                mockTime(5000);
                const timeout: number = 10;

                const result: StepUpLevel = updateAndGetStepUpLevel(req, timeout);

                expect(result).toBe(StepUpLevel.SILVER);
                vi.restoreAllMocks();
            });
        });
    });
    describe('extractStepUpLevelFromJWT', () => {
        it('should return StepUpLevel.NONE when JWT is undefined', () => {
            const result: StepUpLevel = extractStepUpLevelFromJWT(undefined);

            expect(result).toBe(StepUpLevel.NONE);
        });

        it('should return the acr value from the decoded JWT', () => {
            const jwt: string = sign({ acr: StepUpLevel.GOLD }, 'secret');

            const result: StepUpLevel = extractStepUpLevelFromJWT(jwt);

            expect(result).toBe(StepUpLevel.GOLD);
        });

        it('should return StepUpLevel.NONE when acr isnt present', () => {
            const jwt: string = sign({}, 'secret');

            const result: StepUpLevel = extractStepUpLevelFromJWT(jwt);

            expect(result).toBe(StepUpLevel.NONE);
        });

        it('should return StepUpLevel.NONE when invalid jwt', () => {
            const jwt: string = 'abc';

            const result: StepUpLevel = extractStepUpLevelFromJWT(jwt);

            expect(result).toBe(StepUpLevel.NONE);
        });
    });
});
