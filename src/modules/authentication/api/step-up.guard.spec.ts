import { StepUpGuard } from './steup-up.guard.js';
import { type ExecutionContext } from '@nestjs/common';
import { RequiredStepUpLevelNotMetError } from '../domain/required-step-up-level-not-met.error.js';
import { StepUpLevel } from '../passport/oidc.strategy.js';
import { type Request } from 'express';
import { type UserinfoResponse } from 'openid-client';
import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { type PersonPermissions } from '../domain/person-permissions.js';

describe('StepUpGuard', () => {
    let guard: StepUpGuard;

    beforeEach(() => {
        guard = new StepUpGuard();
    });

    const createMockExecutionContext = (stepUpLevel?: StepUpLevel): ExecutionContext => {
        const userInfoResponse: UserinfoResponse = {
            sub: '123',
            name: 'John Doe',
            given_name: 'John',
            family_name: 'Doe',
            email: 'test@test.com',
        };

        const personPermissionsMock: PersonPermissions = createPersonPermissionsMock();

        const request: Partial<Request> = {
            passportUser: {
                stepUpLevel,
                userinfo: userInfoResponse,
                personPermissions: () => Promise.resolve(personPermissionsMock),
            },
        };

        return {
            switchToHttp: () => ({
                getRequest: () => request,
            }),
        } as ExecutionContext;
    };

    it('should allow access if stepUpLevel is GOLD', () => {
        const context: ExecutionContext = createMockExecutionContext(StepUpLevel.GOLD);
        expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw RequiredStepUpLevelNotMetError if stepUpLevel is not GOLD', () => {
        const context: ExecutionContext = createMockExecutionContext(StepUpLevel.SILVER);

        expect(() => guard.canActivate(context)).toThrow(RequiredStepUpLevelNotMetError);
    });

    it('should throw RequiredStepUpLevelNotMetError if stepUpLevel is undefined', () => {
        const context: ExecutionContext = createMockExecutionContext();

        expect(() => guard.canActivate(context)).toThrow(RequiredStepUpLevelNotMetError);
    });
});
