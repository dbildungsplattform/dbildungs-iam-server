import { Test, type TestingModule } from '@nestjs/testing';
import type * as Crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { type Client, Issuer, TokenSet } from 'openid-client';
import { type MockInstance } from 'vitest';

import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { ConfigTestModule, KeycloakConfigTestModule } from '../../../../test/utils/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { OIDCClientProvider, OIDC_CLIENT } from './oidc-client.service.js';

type importType = typeof Crypto;
vi.mock<importType>(import('node:crypto'), async (importOriginal: () => Promise<importType>) => {
    const originalModule: importType = await importOriginal();
    return {
        ...originalModule,
        randomUUID: vi.fn(),
    };
});

describe('OIDCClientProvider', () => {
    let module: TestingModule;
    let sut: Client;
    let grantMock: MockInstance<Client['grant']>;
    let callbackMock: MockInstance<Client['callback']>;
    let loggerMock: DeepMocked<ClassLogger>;
    const attemptId: ReturnType<typeof randomUUID> = '00000000-0000-4000-8000-000000000001';

    beforeAll(async () => {
        const issuer: Issuer = new Issuer({ issuer: 'oidc' });
        class ClientMock extends issuer.Client {}
        grantMock = vi.spyOn(ClientMock.prototype, 'grant');
        callbackMock = vi.spyOn(ClientMock.prototype, 'callback');
        vi.spyOn(Issuer, 'discover').mockResolvedValueOnce({
            ...issuer,
            metadata: issuer.metadata,
            Client: ClientMock,
        });

        module = await Test.createTestingModule({
            imports: [KeycloakConfigTestModule.forRoot(), ConfigTestModule],
            providers: [
                OIDCClientProvider,
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
            ],
        }).compile();

        sut = module.get(OIDC_CLIENT);
        loggerMock = module.get(ClassLogger);
    });

    beforeEach(() => {
        vi.mocked(randomUUID).mockReturnValueOnce(attemptId);
    });

    afterAll(async () => {
        await module.close();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('grant', () => {
        it('should pass through non-authorization-code grants without logging', async () => {
            const tokens: TokenSet = new TokenSet();
            const args: Parameters<Client['grant']> = [
                { grant_type: 'refresh_token', refresh_token: 'refresh-token' },
                { clientAssertionPayload: { aud: 'oidc' } },
            ];
            grantMock.mockResolvedValueOnce(tokens);

            const result: TokenSet = await sut.grant(...args);

            expect(result).toBe(tokens);
            expect(grantMock).toHaveBeenCalledWith(...args);
            expect(grantMock.mock.contexts).toEqual([sut]);
            expect(randomUUID).not.toHaveBeenCalled();
            expect(loggerMock.info).not.toHaveBeenCalled();
            expect(loggerMock.debug).not.toHaveBeenCalled();
            expect(loggerMock.error).not.toHaveBeenCalled();
        });

        it('should log successful authorization code exchanges', async () => {
            const tokens: TokenSet = new TokenSet();
            const args: Parameters<Client['grant']> = [{ grant_type: 'authorization_code', code: 'code' }];
            grantMock.mockResolvedValueOnce(tokens);

            const result: TokenSet = await sut.grant(...args);

            expect(result).toBe(tokens);
            expect(grantMock).toHaveBeenCalledWith(...args);
            expect(grantMock.mock.contexts).toEqual([sut]);
            expect(randomUUID).toHaveBeenCalledTimes(1);
            expect(loggerMock.info).toHaveBeenCalledExactlyOnceWith(
                `Authorization code exchange started, attemptId: ${attemptId}, identityStatus: unknown`,
            );
            expect(loggerMock.debug).toHaveBeenCalledExactlyOnceWith(
                `Authorization code exchange succeeded, attemptId: ${attemptId}, identityStatus: unknown`,
            );
            expect(loggerMock.error).not.toHaveBeenCalled();
        });

        it('should log failed authorization code exchanges and rethrow the original error', async () => {
            const error: Error = new Error('Code exchange failed');
            const args: Parameters<Client['grant']> = [{ grant_type: 'authorization_code', code: 'code' }];
            grantMock.mockRejectedValueOnce(error);

            await expect(sut.grant(...args)).rejects.toBe(error);

            expect(grantMock).toHaveBeenCalledWith(...args);
            expect(loggerMock.info).toHaveBeenCalledExactlyOnceWith(
                `Authorization code exchange started, attemptId: ${attemptId}, identityStatus: unknown`,
            );
            expect(loggerMock.error).toHaveBeenCalledExactlyOnceWith(
                `Authorization code exchange failed, attemptId: ${attemptId}, identityStatus: unknown`,
            );
            expect(loggerMock.debug).not.toHaveBeenCalled();
        });
    });

    describe('callback', () => {
        it('should log the resolved identity only once for a tracked authorization code exchange', async () => {
            const tokens: DeepMocked<TokenSet> = createMock(TokenSet);
            tokens.claims.mockReturnValueOnce({
                sub: 'keycloak-sub',
                iss: 'oidc',
                aud: 'client',
                exp: 3600,
                iat: 0,
            });
            grantMock.mockResolvedValueOnce(tokens);
            callbackMock.mockResolvedValueOnce(tokens).mockResolvedValueOnce(tokens);
            await sut.grant({ grant_type: 'authorization_code', code: 'code' });
            loggerMock.info.mockClear();
            const args: Parameters<Client['callback']> = [
                'https://example.com/callback',
                { code: 'code', state: 'state' },
                { state: 'state', nonce: 'nonce' },
                { exchangeBody: { code_verifier: 'verifier' } },
            ];

            const result: TokenSet = await sut.callback(...args);
            const repeatedResult: TokenSet = await sut.callback(...args);

            expect(result).toBe(tokens);
            expect(repeatedResult).toBe(tokens);
            expect(callbackMock).toHaveBeenCalledTimes(2);
            expect(callbackMock).toHaveBeenNthCalledWith(1, ...args);
            expect(callbackMock).toHaveBeenNthCalledWith(2, ...args);
            expect(callbackMock.mock.contexts).toEqual([sut, sut]);
            expect(loggerMock.info).toHaveBeenCalledExactlyOnceWith(
                `Authorization code exchange identity resolved, attemptId: ${attemptId}, keycloakSub: keycloak-sub`,
            );
            expect(tokens.claims).toHaveBeenCalledTimes(1);
        });
    });
});
