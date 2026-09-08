import { Permissions } from './permissions.decorator.js';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { PersonPermissions } from '../domain/person-permissions.js';
import { ExecutionContext } from '@nestjs/common';
import express from 'express';
import { PassportUser } from '../types/user.js';
import { createExecutionContextMock, createRequestMock } from '../../../../test/utils/http.mocks.js';
import { MockedObject } from 'vitest';
import { createPersonPermissionsMock, createUserinfoResponseMock } from '../../../../test/utils/auth.mock.js';

describe('The Permissions-Decorator', () => {
    let factory: (data: unknown, context: ExecutionContext) => Promise<PersonPermissions | undefined>;

    beforeEach(() => {
        class Demo {
            public blah(_unused: PersonPermissions): void {}
        }

        const target: Demo = new Demo();

        Permissions()(target, 'blah', 0);
        const decoratorFunction: object = Reflect.getMetadata(
            ROUTE_ARGS_METADATA,
            target.constructor,
            'blah',
        ) as object;
        expect(decoratorFunction).toBeDefined();

        factory = (
            Object.values(decoratorFunction)[0] as {
                factory: (data: unknown, context: ExecutionContext) => Promise<PersonPermissions | undefined>;
            }
        ).factory;
    });

    it('should inject a PersonPermissions object if one is in the request', async () => {
        const request: MockedObject<express.Request> = createRequestMock();
        const executionContext: MockedObject<ExecutionContext> = createExecutionContextMock({ request });
        const personPermissions: PersonPermissions = createPersonPermissionsMock();

        request.passportUser = {
            userinfo: createUserinfoResponseMock(),
            personPermissions: (): Promise<PersonPermissions> => {
                return Promise.resolve(personPermissions);
            },
        };

        await expect(factory(null, executionContext)).resolves.toBe(personPermissions);
    });

    it('should reject if passport user is set without personPermission function', async () => {
        const context: ExecutionContext = createExecutionContextMock();
        context.switchToHttp().getRequest<MockedObject<express.Request>>().passportUser = {
            someProperty: 'someValue',
        } as unknown as PassportUser;

        await expect(factory(null, context)).rejects.toThrow(
            "No personPermissions function found on PassportUser: { someProperty: 'someValue' }",
        );
    });

    it('should reject if there is no passport user', async () => {
        const context: ExecutionContext = createExecutionContextMock();
        context.switchToHttp().getRequest<MockedObject<express.Request>>().passportUser = undefined;

        await expect(factory(null, context)).rejects.toThrow('No PassportUser found on request');
    });
});
