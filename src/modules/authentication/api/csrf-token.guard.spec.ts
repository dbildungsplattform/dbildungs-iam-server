import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { type ExecutionContext, BadRequestException } from '@nestjs/common';
import { createExecutionContextMock, createRequestMock } from '../../../../test/utils/http.mocks.js';
import { CsrfTokenService } from '../services/csrf-token.service.js';
import { CsrfProtectionGuard } from './csrf-token.guard.js';
import { Reflector } from '@nestjs/core';
import { type MockedObject } from 'vitest';
import type { Request as ExpressRequest } from 'express';

describe('The CSRF protection guard', () => {
    let csrfTokenService: DeepMocked<CsrfTokenService>;
    let reflector: DeepMocked<Reflector>;
    let sut: CsrfProtectionGuard;

    beforeEach(() => {
        csrfTokenService = createMock(CsrfTokenService);
        reflector = createMock(Reflector);
        sut = new CsrfProtectionGuard(csrfTokenService, reflector);
    });

    it('should allow GET requests', () => {
        const request: MockedObject<ExpressRequest> = createRequestMock({
            method: 'GET',
            path: '/api/something',
        });

        const context: ExecutionContext = createExecutionContextMock({ request });

        expect(sut.canActivate(context)).toEqual(true);
    });

    it('should allow HEAD/OPTIONS requests', () => {
        const headRequest: MockedObject<ExpressRequest> = createRequestMock({ method: 'HEAD' });
        const optionsRequest: MockedObject<ExpressRequest> = createRequestMock({ method: 'OPTIONS' });

        expect(sut.canActivate(createExecutionContextMock({ request: headRequest }))).toEqual(true);
        expect(sut.canActivate(createExecutionContextMock({ request: optionsRequest }))).toEqual(true);
    });

    it('should allow JWT requests (Bearer token)', () => {
        const request: MockedObject<ExpressRequest> = createRequestMock({
            method: 'POST',
            headers: {
                authorization: 'Bearer some-token',
            },
        });

        const context: ExecutionContext = createExecutionContextMock({ request });

        expect(sut.canActivate(context)).toEqual(true);
    });

    it('should allow API Header requests (Bearer token)', () => {
        const request: MockedObject<ExpressRequest> = createRequestMock({
            method: 'POST',
            headers: {
                'api-key': 'api-key-value',
            },
        });

        const context: ExecutionContext = createExecutionContextMock({ request });

        expect(sut.canActivate(context)).toEqual(true);
    });

    it('should allow routes marked as public', () => {
        const request: MockedObject<ExpressRequest> = createRequestMock({
            method: 'POST',
        });

        const context: ExecutionContext = createExecutionContextMock({ request });
        reflector.getAllAndOverride.mockReturnValueOnce(true);

        expect(sut.canActivate(context)).toEqual(true);
    });

    it('should throw BadRequestException when CSRF token is invalid', () => {
        csrfTokenService.validateToken.mockReturnValue(false);

        const request: MockedObject<ExpressRequest> = createRequestMock({
            method: 'POST',
            path: '/api/protected',
            headers: {},
        });

        const context: ExecutionContext = createExecutionContextMock({ request });

        expect(() => sut.canActivate(context)).toThrow(BadRequestException);
        expect(csrfTokenService.validateToken).toHaveBeenCalledWith(request);
    });

    it('should allow request when CSRF token is valid', () => {
        csrfTokenService.validateToken.mockReturnValue(true);

        const request: MockedObject<ExpressRequest> = createRequestMock({
            method: 'POST',
            path: '/api/protected',
            headers: {},
        });

        const context: ExecutionContext = createExecutionContextMock({ request });

        expect(sut.canActivate(context)).toEqual(true);
        expect(csrfTokenService.validateToken).toHaveBeenCalledWith(request);
    });
});
