import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { Reflector } from '@nestjs/core';
import { type ExecutionContext } from '@nestjs/common';
import type express from 'express';
import { AccessApiKeyGuard } from './access.apikey.guard.js';
import { type Mock } from 'vitest';
import { createExecutionContextMock } from '../../../../test/utils/http.mocks.js';

const canActivateSpy: Mock = vi.spyOn(AccessApiKeyGuard.prototype, 'canActivate');

describe('The access apikey guard', () => {
    let reflector: DeepMocked<Reflector>;
    let sut: AccessApiKeyGuard;

    beforeEach(() => {
        reflector = createMock(Reflector);
        sut = new AccessApiKeyGuard(reflector);
    });

    it('should allow activation if request authenticated', () => {
        reflector.get.mockReturnValueOnce(false);

        const context: ExecutionContext = createExecutionContextMock();
        (
            context.switchToHttp().getRequest<DeepMocked<express.Request>>().isAuthenticated as unknown as Mock<
                () => boolean
            >
        ).mockReturnValue(true);
        expect(sut.canActivate(context)).toEqual(true);
    });

    it('should delegate its activation if it cannot decide for itself', async () => {
        reflector.get.mockReturnValueOnce(false);

        const context: ExecutionContext = createExecutionContextMock();
        (
            context.switchToHttp().getRequest<DeepMocked<express.Request>>().isAuthenticated as unknown as Mock<
                () => boolean
            >
        ).mockReturnValue(false);
        await expect(sut.canActivate(context)).rejects.toThrow('Unknown authentication strategy "api-key"');
        expect(canActivateSpy).toHaveBeenCalled();
    });
});
