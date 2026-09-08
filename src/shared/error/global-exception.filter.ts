import { DriverException } from '@mikro-orm/core';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { AbstractHttpAdapter, HttpAdapterHost } from '@nestjs/core';
import util from 'util';
import { ClassLogger } from '../../core/logging/class-logger.js';
import { DbiamError } from './dbiam.error.js';

const DB_ERROR: DbiamError = new DbiamError({
    code: 500,
    i18nKey: 'DB_ERROR',
});

const UNKNOWN_ERROR: DbiamError = new DbiamError({
    code: 500,
    i18nKey: 'INTERNAL_SERVER_ERROR',
});

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    public constructor(
        private readonly httpAdapterHost: HttpAdapterHost,
        private logger: ClassLogger,
    ) {}

    public catch(exception: unknown, host: ArgumentsHost): void {
        // In certain situations `httpAdapter` might not be available in the
        // constructor method, thus we should resolve it here.
        const { httpAdapter }: { httpAdapter: AbstractHttpAdapter } = this.httpAdapterHost;

        const ctx: ReturnType<ArgumentsHost['switchToHttp']> = host.switchToHttp();

        if (exception instanceof Error) {
            if (exception instanceof HttpException) {
                if (exception.getStatus() === 503) {
                    const url: string = (ctx.getRequest() satisfies Request)?.url;
                    this.logger.crit(`503 Service Unavailable for URL: ${url}`);
                }
                httpAdapter.reply(ctx.getResponse(), exception.getResponse(), exception.getStatus());
            } else if (exception instanceof DriverException) {
                this.logger.crit(exception.message, exception.stack);

                httpAdapter.reply(ctx.getResponse(), DB_ERROR, DB_ERROR.code);
            } else {
                this.logger.crit(
                    `UNEXPECTED EXCEPTION - no instance of known Error: ${util.inspect(exception, { depth: 2, compact: Infinity, breakLength: Infinity })}`,
                    exception.stack,
                );

                httpAdapter.reply(ctx.getResponse(), UNKNOWN_ERROR, UNKNOWN_ERROR.code);
            }
        } else {
            this.logger.crit(
                `UNEXPECTED EXCEPTION - no instance of Error: ${util.inspect(exception, { depth: 2, compact: Infinity, breakLength: Infinity })}`,
            );

            httpAdapter.reply(ctx.getResponse(), UNKNOWN_ERROR, UNKNOWN_ERROR.code);
        }
    }
}
