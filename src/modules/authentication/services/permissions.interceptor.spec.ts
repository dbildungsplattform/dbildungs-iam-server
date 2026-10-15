import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Request } from 'express';
import { sign } from 'jsonwebtoken';

import { PersonPermissionsRepo } from '../domain/person-permission.repo.js';
import { PermissionsInterceptor } from './permissions.interceptor.js';
import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { createExecutionContextMock, createRequestMock } from '../../../../test/utils/http.mocks.js';

describe('Permission Interceptor', () => {
    let module: TestingModule;

    let sut: PermissionsInterceptor;
    let permissionRepoMock: DeepMocked<PersonPermissionsRepo>;
    const nextMock: DeepMocked<CallHandler> = { handle: vi.fn() };

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                PermissionsInterceptor,
                {
                    provide: PersonPermissionsRepo,
                    useValue: createMock(PersonPermissionsRepo),
                },
            ],
        }).compile();

        sut = module.get(PermissionsInterceptor);
        permissionRepoMock = module.get(PersonPermissionsRepo);
    });

    afterAll(async () => {
        await module.close();
    });

    it('should call next middleware', () => {
        sut.intercept(createExecutionContextMock(), nextMock);

        expect(nextMock.handle).toHaveBeenCalledTimes(1);
    });

    describe('when request contains passportUser', () => {
        it('should attach personPermissions function', async () => {
            const subjectId: string = faker.string.uuid();
            const request: DeepMocked<Request> = createRequestMock({
                passportUser: {
                    access_token: sign({ sub: subjectId }, 'secret'),
                },
            });
            const context: DeepMocked<ExecutionContext> = createExecutionContextMock({ request });
            permissionRepoMock.loadPersonPermissions.mockResolvedValueOnce(createPersonPermissionsMock());

            sut.intercept(context, nextMock);
            await expect(request.passportUser?.personPermissions()).resolves.toBeDefined();

            expect(request.passportUser?.personPermissions).toBeInstanceOf(Function);
            expect(permissionRepoMock.loadPersonPermissions).toHaveBeenCalledWith(subjectId);
        });
    });

    describe('when request is missing data', () => {
        it('should not fail when missing access-token', () => {
            const request: DeepMocked<Request> = createRequestMock({
                passportUser: {
                    access_token: undefined,
                },
            });
            const context: DeepMocked<ExecutionContext> = createExecutionContextMock({ request });

            expect(() => sut.intercept(context, nextMock)).not.toThrow();
            expect(request.passportUser?.personPermissions).toBeUndefined();
        });

        it('should not fail when missing passportUser', () => {
            const request: DeepMocked<Request> = createRequestMock({
                passportUser: undefined,
            });
            const context: DeepMocked<ExecutionContext> = createExecutionContextMock({ request });

            expect(() => sut.intercept(context, nextMock)).not.toThrow();
            expect(request.passportUser?.personPermissions).toBeUndefined();
        });

        it('should not fail when access-token is missing subject', () => {
            const request: DeepMocked<Request> = createRequestMock({
                passportUser: { access_token: sign({}, 'secret') },
            });
            const context: DeepMocked<ExecutionContext> = createExecutionContextMock({ request });

            expect(() => sut.intercept(context, nextMock)).not.toThrow();
            expect(request.passportUser?.personPermissions).toBeUndefined();
        });

        it('should not fail when access-token is malformed', () => {
            const request: DeepMocked<Request> = createRequestMock({
                passportUser: { access_token: 'malformed' },
            });
            const context: DeepMocked<ExecutionContext> = createExecutionContextMock({ request });

            expect(() => sut.intercept(context, nextMock)).not.toThrow();
            expect(request.passportUser?.personPermissions).toBeUndefined();
        });
    });
});
