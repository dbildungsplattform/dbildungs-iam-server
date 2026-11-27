import { type DbConfig } from './db.config.js';
import { type EmailMicroserviceConfig } from './email-microservice.config.js';
import { type HeaderApiKeyConfig } from './headerapikey.config.js';
import { type HostConfig } from './host.config.js';
import { type LoggingConfig } from './logging.config.js';
import { type RedisConfig } from './redis.config.js';

export type KeycloakExternalDataAppConfig = {
    HOST: Partial<HostConfig>;
    LOGGING: Partial<LoggingConfig>;
    DB: Partial<DbConfig>;
    REDIS: Partial<RedisConfig>;
    HEADER_API_KEY: Partial<HeaderApiKeyConfig>;
    EMAIL_MICROSERVICE: Partial<EmailMicroserviceConfig>;
};

export function getKeycloakExternalDataAppConfig(): KeycloakExternalDataAppConfig {
    return {
        HOST: {},
        LOGGING: {
            DEFAULT_LOG_LEVEL: process.env['LOGGING_DEFAULT_LOG_LEVEL'],
        },
        DB: {
            DB_NAME: process.env['DB_NAME'],
            USERNAME: process.env['DB_USERNAME'],
            SECRET: process.env['DB_SECRET'],
            CLIENT_URL: process.env['DB_CLIENT_URL'],
        },
        REDIS: {
            PASSWORD: process.env['REDIS_PASSWORD'],
            HOST: process.env['REDIS_HOST'],
        },
        HEADER_API_KEY: {
            INTERNAL_COMMUNICATION_API_KEY: process.env['INTERNAL_COMMUNICATION_API_KEY'],
        },
        EMAIL_MICROSERVICE: {
            ENDPOINT: process.env['EMAIL_MICROSERVICE__ENDPOINT'],
        },
    };
}
