import { DbConfig } from './db.config.js';
import { EmailConfig } from './email.config.js';
import { HeaderApiKeyConfig } from './headerapikey.config.js';
import { HostConfig } from './host.config.js';
import { LdapEmailMicroserviceConfig } from './ldap-email-microservice.config.js';
import { LoggingConfig } from './logging.config.js';
import { OxEmailMicroserviceConfig } from './ox-email-microservice.config.js';
import { envToOptionalBoolean, envToOptionalInteger } from './utils.js';

export type EmailAppConfig = {
    HOST: Partial<HostConfig>;
    LOGGING: Partial<LoggingConfig>;
    DB: Partial<DbConfig>;
    LDAP: Partial<LdapEmailMicroserviceConfig>;
    OX: Partial<OxEmailMicroserviceConfig>;
    EMAIL: Partial<EmailConfig>;
    HEADER_API_KEY: Partial<HeaderApiKeyConfig>;
};

export function getEmailConfig(): EmailAppConfig {
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
        LDAP: {
            ENABLED: envToOptionalBoolean('LDAP_ENABLED'),
            URL: process.env['LDAP_URL'],
            BIND_DN: process.env['LDAP_BIND_DN'],
            ADMIN_PASSWORD: process.env['LDAP_ADMIN_PASSWORD'],
            OEFFENTLICHE_SCHULEN_DOMAIN: process.env['LDAP_OEFFENTLICHE_SCHULEN_DOMAIN'],
            ERSATZSCHULEN_DOMAIN: process.env['LDAP_ERSATZSCHULEN_DOMAIN'],
            BASE_DN: process.env['LDAP_BASE_DN'],
            RETRY_WRAPPER_DEFAULT_RETRIES: envToOptionalInteger('RETRY_WRAPPER_DEFAULT_RETRIES'),
            RETRY_WRAPPER_RETRY_DELAY_IN_MS: envToOptionalInteger('RETRY_WRAPPER_RETRY_DELAY_IN_MS'),
        },
        OX: {
            ENABLED: envToOptionalBoolean('OX_ENABLED'),
            ENDPOINT: process.env['OX_ENDPOINT'],
            USERNAME: process.env['OX_USERNAME'],
            PASSWORD: process.env['OX_PASSWORD'],
            CONTEXT_ID: process.env['OX_CONTEXT_ID'],
            CONTEXT_NAME: process.env['OX_CONTEXT_NAME'],
            NUMBER_OF_RETRIES: envToOptionalInteger('OX_NUMBER_OF_RETRIES'),
            USER_PASSWORD_DEFAULT: process.env['OX_USER_PASSWORD_DEFAULT'],
            EMAIL_ADDRESS_DELETED_EVENT_DELAY: envToOptionalInteger('OX_EMAIL_ADDRESS_DELETED_EVENT_DELAY'),
        },
        EMAIL: {
            NON_ENABLED_EMAIL_ADDRESSES_DEADLINE_IN_DAYS: envToOptionalInteger(
                'NON_ENABLED_EMAIL_ADDRESSES_DEADLINE_IN_DAYS',
            ),
        },
        HEADER_API_KEY: {
            INTERNAL_COMMUNICATION_API_KEY: process.env['INTERNAL_COMMUNICATION_API_KEY'],
        },
    };
}
