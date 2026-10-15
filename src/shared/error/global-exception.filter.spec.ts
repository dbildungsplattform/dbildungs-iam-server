import { type ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { type AbstractHttpAdapter, type HttpAdapterHost } from '@nestjs/core';
import { type Response } from 'express';
import { ClassLogger } from '../../core/logging/class-logger.js';
import { GlobalExceptionFilter } from './global-exception.filter.js';
import { DriverException } from '@mikro-orm/core';
import { createMock, type DeepMocked } from '../../../test/utils/createMock.js';
import { DbiamError } from './dbiam.error.js';

type HttpArgumentsHost = ReturnType<ArgumentsHost['switchToHttp']>;

describe('GlobalExceptionFilter', () => {
    let sut: GlobalExceptionFilter;

    let loggerMock: DeepMocked<ClassLogger>;
    let adapterHostMock: Partial<HttpAdapterHost>;
    let adapterImplMock: Partial<AbstractHttpAdapter>;
    let responseMock: Partial<Response>;
    let argumentsHost: Partial<ArgumentsHost>;

    beforeEach(() => {
        loggerMock = createMock(ClassLogger);
        adapterImplMock = {
            reply: vi.fn(),
        };
        adapterHostMock = {
            httpAdapter: adapterImplMock,
        } as HttpAdapterHost;
        responseMock = {
            setHeader: vi.fn().mockReturnThis(),
        };
        const httpArgumentsHostMock: Partial<HttpArgumentsHost> = {
            getRequest: vi.fn().mockReturnValue({ url: '/test-url' }),
            getResponse: vi.fn().mockImplementation(() => responseMock),
        };
        argumentsHost = {
            switchToHttp: vi.fn(() => httpArgumentsHostMock as HttpArgumentsHost),
        };
        sut = new GlobalExceptionFilter(adapterHostMock as HttpAdapterHost, loggerMock);
    });

    describe('catch', () => {
        describe('when filter catches HttpException', () => {
            it('should pass it on to the http adapter', () => {
                const httpException: HttpException = new HttpException('exception', 400);

                sut.catch(httpException, argumentsHost as ArgumentsHost);

                expect(adapterImplMock.reply).toHaveBeenCalledTimes(1);
                expect(adapterImplMock.reply).toHaveBeenCalledWith(
                    responseMock,
                    httpException.getResponse(),
                    httpException.getStatus(),
                );
                expect(loggerMock.crit).toHaveBeenCalledTimes(0);
            });
        });

        describe('when filter catches HttpException Service Unavailable', () => {
            it('should log request url with crit and pass it on to the http adapter', () => {
                const httpException: HttpException = new HttpException('exception', 503);

                sut.catch(httpException, argumentsHost as ArgumentsHost);

                expect(adapterImplMock.reply).toHaveBeenCalledTimes(1);
                expect(adapterImplMock.reply).toHaveBeenCalledWith(
                    responseMock,
                    httpException.getResponse(),
                    httpException.getStatus(),
                );
                expect(loggerMock.crit).toHaveBeenCalledTimes(1);
            });
        });

        describe('when filter catches DriverException', () => {
            it('should map it to DbiamError with code 500', () => {
                const driverException: DriverException = new DriverException({ stack: '' } as Error);
                const expectedOutput: DbiamError = new DbiamError({
                    code: 500,
                    i18nKey: 'DB_ERROR',
                });

                sut.catch(driverException, argumentsHost as ArgumentsHost);

                expect(adapterImplMock.reply).toHaveBeenCalledTimes(1);
                expect(adapterImplMock.reply).toHaveBeenCalledWith(
                    responseMock,
                    expectedOutput,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                );
                expect(loggerMock.crit).toHaveBeenCalledTimes(1);
            });
        });

        describe('when filter catches Unknown Error', () => {
            it('should map it to DbiamError with code 500', () => {
                const unknownError: Error = new Error('error');
                const expectedOutput: DbiamError = new DbiamError({
                    code: 500,
                    i18nKey: 'INTERNAL_SERVER_ERROR',
                });

                sut.catch(unknownError, argumentsHost as ArgumentsHost);

                expect(adapterImplMock.reply).toHaveBeenCalledTimes(1);
                expect(adapterImplMock.reply).toHaveBeenCalledWith(
                    responseMock,
                    expectedOutput,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                );
            });
        });

        describe('when filter catches unknown type which is not an Error', () => {
            it('should map it to DbiamError with code 500', () => {
                const unknownError: string = 'not an error';
                const expectedOutput: DbiamError = new DbiamError({
                    code: 500,
                    i18nKey: 'INTERNAL_SERVER_ERROR',
                });

                sut.catch(unknownError, argumentsHost as ArgumentsHost);

                expect(adapterImplMock.reply).toHaveBeenCalledTimes(1);
                expect(adapterImplMock.reply).toHaveBeenCalledWith(
                    responseMock,
                    expectedOutput,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                );
            });
        });
    });
});
