import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Request } from 'express';
import { vi } from 'vitest';
import { CsrfTokenService } from './csrf-token.service.js';
import { createMock } from '../../../../test/utils/createMock.js';

describe('CsrfTokenService', () => {
    let module: TestingModule;
    let csrfTokenService: CsrfTokenService;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [CsrfTokenService],
        }).compile();

        csrfTokenService = module.get(CsrfTokenService);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(csrfTokenService).toBeDefined();
    });

    describe('generateToken', () => {
        function setupRequest(hasSession: boolean = true): Request {
            const requestMock: Request = createMock<Request>({
                prototype: {} as Request,
            });
            if (hasSession) {
                requestMock.session = {
                    csrfToken: undefined,
                    touch: vi.fn(),
                } as unknown as Request['session'];
            } else {
                requestMock.session = undefined as unknown as Request['session'];
            }
            return requestMock;
        }

        describe('when session is initialized', () => {
            it('should return a token string', () => {
                const requestMock: Request = setupRequest();

                const token: string = csrfTokenService.generateToken(requestMock);

                expect(typeof token).toBe('string');
                expect(token).toHaveLength(64); // 32 bytes as hex
            });

            it('should save token to session', () => {
                const requestMock: Request = setupRequest();

                const token: string = csrfTokenService.generateToken(requestMock);

                expect(requestMock.session.csrfToken).toBe(token);
            });

            it('should call session.touch', () => {
                const requestMock: Request = setupRequest();

                csrfTokenService.generateToken(requestMock);

                expect(requestMock.session.touch).toHaveBeenCalled();
            });

            it('should generate unique tokens on each call', () => {
                const requestMock: Request = setupRequest();

                const token1: string = csrfTokenService.generateToken(requestMock);
                const token2: string = csrfTokenService.generateToken(requestMock);

                expect(token1).not.toBe(token2);
            });
        });

        describe('when session is not initialized', () => {
            it('should throw BadRequestException', () => {
                const requestMock: Request = setupRequest(false);

                expect(() => csrfTokenService.generateToken(requestMock)).toThrow(BadRequestException);
            });
        });
    });

    describe('validateToken', () => {
        function setupRequest(sessionToken?: string, headerToken?: string, queryToken?: string): Request {
            const requestMock: Request = createMock<Request>({
                prototype: {} as Request,
            });
            requestMock.session = { csrfToken: sessionToken } as unknown as Request['session'];
            requestMock.headers = headerToken ? { 'x-csrf-token': headerToken } : {};
            requestMock.query = queryToken ? { csrfToken: queryToken } : {};
            return requestMock;
        }

        describe('when token is passed directly', () => {
            it('should return true when token matches session', () => {
                const token: string = 'valid-token';
                const requestMock: Request = setupRequest(token);

                expect(csrfTokenService.validateToken(requestMock, token)).toBe(true);
            });

            it('should return false when token does not match session', () => {
                const requestMock: Request = setupRequest('session-token');

                expect(csrfTokenService.validateToken(requestMock, 'wrong-token')).toBe(false);
            });
        });

        describe('when token is extracted from header', () => {
            it('should return true when header token matches session', () => {
                const token: string = 'valid-token';
                const requestMock: Request = setupRequest(token, token);

                expect(csrfTokenService.validateToken(requestMock)).toBe(true);
            });

            it('should return false when header token does not match session', () => {
                const requestMock: Request = setupRequest('session-token', 'wrong-token');

                expect(csrfTokenService.validateToken(requestMock)).toBe(false);
            });
        });

        describe('when token is extracted from query', () => {
            it('should return true when query token matches session', () => {
                const token: string = 'valid-token';
                const requestMock: Request = setupRequest(token, undefined, token);

                expect(csrfTokenService.validateToken(requestMock)).toBe(true);
            });

            it('should return false when query token does not match session', () => {
                const requestMock: Request = setupRequest('session-token', undefined, 'wrong-token');

                expect(csrfTokenService.validateToken(requestMock)).toBe(false);
            });
        });

        describe('when tokens are missing', () => {
            it('should return false when session token is missing', () => {
                const requestMock: Request = setupRequest(undefined, 'some-token');

                expect(csrfTokenService.validateToken(requestMock)).toBe(false);
            });

            it('should return false when request token is missing', () => {
                const requestMock: Request = setupRequest('session-token');

                expect(csrfTokenService.validateToken(requestMock)).toBe(false);
            });

            it('should return false when both tokens are missing', () => {
                const requestMock: Request = setupRequest();

                expect(csrfTokenService.validateToken(requestMock)).toBe(false);
            });
        });

        describe('when tokens have different lengths', () => {
            it('should return false without throwing', () => {
                const requestMock: Request = setupRequest('short', 'a-much-longer-token-that-differs');

                expect(csrfTokenService.validateToken(requestMock, 'a-much-longer-token-that-differs')).toBe(false);
            });
        });
    });
});
