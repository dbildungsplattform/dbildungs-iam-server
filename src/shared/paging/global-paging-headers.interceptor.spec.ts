import { type Observable, from, lastValueFrom } from 'rxjs';
import { type ArgumentsHost, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { DISABLE_PAGING_INTERCEPTOR, GlobalPagingHeadersInterceptor } from './global-paging-headers.interceptor.js';
import { type Response } from 'express';
import { PagedResponse } from './paged.response.js';
import { PagingHeaders } from './paging.enums.js';

type HttpArgumentsHost = ReturnType<ArgumentsHost['switchToHttp']>;

describe('GlobalPagingHeadersInterceptor', () => {
    const sut: GlobalPagingHeadersInterceptor = new GlobalPagingHeadersInterceptor();
    let responseMock: Partial<Response>;
    let contextMock: Partial<ExecutionContext>;
    let callHandlerMock: Partial<CallHandler>;

    describe('intercept', () => {
        describe('when intercepting a paged response', () => {
            beforeEach(() => {
                responseMock = {
                    setHeader: vi.fn().mockReturnThis(),
                };
                const httpArgumentsHostMock: Partial<HttpArgumentsHost> = {
                    getResponse: vi.fn().mockImplementation(() => responseMock),
                };
                contextMock = {
                    switchToHttp: vi.fn(() => httpArgumentsHostMock as HttpArgumentsHost),
                    getHandler: vi.fn(() => (): void => {}),
                };
                callHandlerMock = {
                    handle: vi.fn(() => from([new PagedResponse({ offset: 0, limit: 0, total: 0, items: [] })])),
                } as CallHandler;
            });

            it('should set pagination headers for the response', async () => {
                const observable: Observable<unknown> = sut.intercept(
                    contextMock as ExecutionContext,
                    callHandlerMock as CallHandler,
                );

                // is needed to execute the observable pipeline
                await lastValueFrom(observable);

                expect(responseMock.setHeader).toBeCalledTimes(4);
                expect(responseMock.setHeader).toBeCalledWith(PagingHeaders.OFFSET, 0);
                expect(responseMock.setHeader).toBeCalledWith(PagingHeaders.LIMIT, 0);
                expect(responseMock.setHeader).toBeCalledWith(PagingHeaders.TOTAL, 0);
            });

            it('should change response type to list', async () => {
                const observable: Observable<unknown> = sut.intercept(
                    contextMock as ExecutionContext,
                    callHandlerMock as CallHandler,
                );

                await expect(lastValueFrom(observable)).resolves.toStrictEqual([]);
            });
        });

        describe('when intercepting a non paged response', () => {
            beforeEach(() => {
                responseMock = {
                    setHeader: vi.fn().mockReturnThis(),
                };
                const httpArgumentsHostMock: Partial<HttpArgumentsHost> = {
                    getResponse: vi.fn().mockImplementation(() => responseMock),
                };
                contextMock = {
                    switchToHttp: vi.fn(() => httpArgumentsHostMock as HttpArgumentsHost),
                    getHandler: vi.fn(() => (): void => {}),
                };
                callHandlerMock = {
                    handle: vi.fn(() => from([null])),
                } as CallHandler;
            });

            it('should not set any headers', async () => {
                const observable: Observable<unknown> = sut.intercept(
                    contextMock as ExecutionContext,
                    callHandlerMock as CallHandler,
                );

                // is needed to execute the observable pipeline
                await lastValueFrom(observable);

                expect(responseMock.setHeader).toBeCalledTimes(0);
            });

            it('should not change response type', async () => {
                const observable: Observable<unknown> = sut.intercept(
                    contextMock as ExecutionContext,
                    callHandlerMock as CallHandler,
                );

                await expect(lastValueFrom(observable)).resolves.toBeNull();
            });
        });

        describe('when endpoint should be ignored', () => {
            beforeEach(() => {
                responseMock = {
                    setHeader: vi.fn().mockReturnThis(),
                };
                const httpArgumentsHostMock: Partial<HttpArgumentsHost> = {
                    getResponse: vi.fn().mockImplementation(() => responseMock),
                };
                const handlerMock = (): void => {};
                Reflect.defineMetadata(DISABLE_PAGING_INTERCEPTOR, true, handlerMock);
                Reflect.defineMetadata(DISABLE_PAGING_INTERCEPTOR, true, handlerMock);
                contextMock = {
                    getHandler: (): (() => void) => handlerMock, // <-- return the same function
                    switchToHttp: (): HttpArgumentsHost => httpArgumentsHostMock as HttpArgumentsHost,
                };
                callHandlerMock = {
                    handle: vi.fn(() => from([new PagedResponse({ offset: 0, limit: 0, total: 0, items: [] })])),
                } as CallHandler;
            });

            it('should not set any headers', async () => {
                const observable: Observable<unknown> = sut.intercept(
                    contextMock as ExecutionContext,
                    callHandlerMock as CallHandler,
                );

                // is needed to execute the observable pipeline
                await lastValueFrom(observable);

                expect(responseMock.setHeader).toBeCalledTimes(0);
            });

            it('should not change response type', async () => {
                const observable: Observable<unknown> = sut.intercept(
                    contextMock as ExecutionContext,
                    callHandlerMock as CallHandler,
                );

                await expect(lastValueFrom(observable)).resolves.toStrictEqual(
                    new PagedResponse({ offset: 0, limit: 0, total: 0, items: [] }),
                );
            });
        });
    });
});
