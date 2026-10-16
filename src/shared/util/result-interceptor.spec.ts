import { Test, type TestingModule } from '@nestjs/testing';
import { ResultInterceptor } from './result-interceptor.js';
import { type ArgumentsHost, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { type Observable, of } from 'rxjs';
import { ConfigTestModule } from '../../../test/utils/index.js';
import { EntityNotFoundError, KeycloakClientError } from '../error/index.js';
import { type Response } from 'express';

type HttpArgumentsHost = ReturnType<ArgumentsHost['switchToHttp']>;

describe('ResultInterceptor', () => {
    let module: TestingModule;
    let sut: ResultInterceptor<string>;
    let responseMock: Partial<Response>;
    let contextMock: Partial<ExecutionContext>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule],
            providers: [ResultInterceptor],
        }).compile();
        sut = module.get(ResultInterceptor);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('intercept', () => {
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
        });
        describe('when result of intercepted method is ok:true, value:string', () => {
            it('should be defined', () => {
                const callHandler: CallHandler<Result<string>> = {
                    handle(): Observable<Result<string>> {
                        return of({
                            ok: true,
                            value: 'somePasswd',
                        });
                    },
                };
                const result: Observable<string> = sut.intercept(contextMock as ExecutionContext, callHandler);
                result.subscribe((data: string) => {
                    expect(data).toBeDefined();
                });
                expect(result).toBeDefined();
            });
        });
        describe('when result of intercepted method is ok:false, error', () => {
            describe('when error is EntityNotFoundError', () => {
                it('should be defined', () => {
                    const callHandler: CallHandler<Result<string>> = {
                        handle(): Observable<Result<string>> {
                            return of({
                                ok: false,
                                error: new EntityNotFoundError(),
                            });
                        },
                    };
                    const result: Observable<string> = sut.intercept(contextMock as ExecutionContext, callHandler);
                    result.subscribe(
                        (data: string) => {
                            expect(data).toBeDefined();
                        },
                        (error: Error) => expect(error).toBeDefined(),
                    );
                    expect(result).toBeDefined();
                });
            });
            describe('when error is other error', () => {
                it('should be defined', () => {
                    const callHandler: CallHandler<Result<string>> = {
                        handle(): Observable<Result<string>> {
                            return of({
                                ok: false,
                                error: new KeycloakClientError(''),
                            });
                        },
                    };
                    const result: Observable<string> = sut.intercept(contextMock as ExecutionContext, callHandler);
                    result.subscribe(
                        (data: string) => {
                            expect(data).toBeDefined();
                        },
                        (error: Error) => expect(error).toBeDefined(),
                    );
                    expect(result).toBeDefined();
                });
            });
        });
    });
});
