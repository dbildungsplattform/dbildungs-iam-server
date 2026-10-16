import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { type ExecutionContext } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { createMock } from '../../../test/utils/createMock.js';
import { ClassLogger } from '../../core/logging/class-logger.js';
import { ExternalDataCacheInterceptor } from './external-data-cache-interceptor.js';

describe('ExternalDataCacheInterceptor', () => {
    let module: TestingModule;

    let sut: ExternalDataCacheInterceptor;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                ExternalDataCacheInterceptor,
                {
                    provide: Cache,
                    useValue: createMock(Cache),
                },
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
                { provide: CACHE_MANAGER, useValue: { get: vi.fn(), set: vi.fn() } },
            ],
        }).compile();

        sut = module.get(ExternalDataCacheInterceptor);
    });

    afterAll(async () => {
        await module.close();
    });

    describe('trackBy', () => {
        it('hashes the request body', () => {
            const body: object = { a: 1, b: 'x' };
            const url: string = '/test';

            Object.defineProperty(sut, 'httpAdapterHost', {
                value: { httpAdapter: { getRequestUrl: () => url } },
                configurable: true,
                writable: true,
            });

            const ctx: ExecutionContext = {
                switchToHttp: () => ({
                    getRequest: () => ({ body }),
                }),
            } as unknown as ExecutionContext;

            const key: string | undefined = sut.trackBy(ctx);
            const expectedHash: string = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');

            expect(key).toBe(`${url}:${expectedHash}`);
        });

        it('treats undefined body as {}', () => {
            const url: string = '/test';

            Object.defineProperty(sut, 'httpAdapterHost', {
                value: { httpAdapter: { getRequestUrl: () => url } },
                configurable: true,
                writable: true,
            });

            const ctx: ExecutionContext = {
                switchToHttp: () => ({
                    getRequest: () => ({ body: undefined }),
                }),
            } as unknown as ExecutionContext;

            const key: string | undefined = sut.trackBy(ctx);
            const expectedHash: string = crypto.createHash('sha256').update(JSON.stringify({})).digest('hex');

            expect(key).toBe(`${url}:${expectedHash}`);
        });

        it('returns undefined if httpAdapter is not available', () => {
            Object.defineProperty(sut, 'httpAdapterHost', {
                value: { httpAdapter: undefined },
                configurable: true,
                writable: true,
            });
            const ctx: ExecutionContext = {
                switchToHttp: () => ({
                    getRequest: () => ({ body: {} }),
                }),
            } as unknown as ExecutionContext;

            const key: string | undefined = sut.trackBy(ctx);

            expect(key).toBeUndefined();
        });
    });
});
