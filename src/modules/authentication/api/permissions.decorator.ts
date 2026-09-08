import { createParamDecorator, ExecutionContext, HttpException, PipeTransform, Type } from '@nestjs/common';
import { Request } from 'express';
import { PassportUser } from '../types/user.js';
import { PersonPermissions } from '../domain/person-permissions.js';
import winston, { format, Logger } from 'winston';
import { localFormatter } from '../../../core/logging/module-logger.js';
import { inspect } from 'util';

const loggerFormat: winston.Logform.Format = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.ms(),
    format.colorize(),
    format.printf(localFormatter),
);

const logger: Logger = winston.createLogger({
    format: loggerFormat,
    levels: winston.config.syslog.levels,
    exitOnError: false,
    handleExceptions: true,
    handleRejections: true,
    transports: [new winston.transports.Console()], // transport needs to be newly created here to not share log level with other loggers
});

export const Permissions: (
    ...dataOrPipes: (Type<PipeTransform> | PipeTransform<unknown, unknown> | unknown[])[]
) => ParameterDecorator = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): Promise<PersonPermissions | undefined> => {
        const request: Request = ctx.switchToHttp().getRequest();
        const passportUser: PassportUser | undefined = request.passportUser;

        if (!passportUser) {
            return Promise.reject(new Error('No PassportUser found on request'));
        } else {
            if (!passportUser.personPermissions || typeof passportUser.personPermissions !== 'function') {
                const passportUserString: string = inspect(passportUser, {
                    compact: Infinity,
                    depth: 1,
                    breakLength: Infinity,
                });
                logger.error(
                    `PassportUser does not have personPermissions function. passportUser: ${passportUserString}`,
                );
                return Promise.reject(
                    new HttpException(
                        `No personPermissions function found on PassportUser: ${passportUserString}`,
                        500,
                    ),
                );
            }
            return passportUser.personPermissions();
        }
    },
);
