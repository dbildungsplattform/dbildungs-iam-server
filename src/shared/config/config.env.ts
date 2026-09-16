import { RollenArt } from '../../modules/rolle/domain/rolle.enums.js';
import { CronConfig } from './cron.config.js';
import { DbConfig } from './db.config.js';
import { EmailMicroserviceConfig } from './email-microservice.config.js';
import { FeatureFlagConfig } from './featureflag.config.js';
import { FrontendConfig } from './frontend.config.js';
import { HeaderApiKeyConfig } from './headerapikey.config.js';
import { HostConfig } from './host.config.js';
import { ImportConfig } from './import.config.js';
import { ItsLearningConfig } from './itslearning.config.js';
import { KafkaConfig } from './kafka.config.js';
import { KeycloakConfig } from './keycloak.config.js';
import { LdapServerConfig } from './ldap-server.config.js';
import { OxServerConfig } from './ox-server.config.js';
import { PortalConfig } from './portal.config.js';
import { PrivacyIdeaConfig } from './privacyidea.config.js';
import { RedisConfig } from './redis.config.js';
import { SchulconnexConfig } from './schulconnex.config.js';
import { SystemConfig } from './system.config.js';
import { envToEnumArray, envToOptionalBoolean, envToOptionalInteger } from './utils.js';
import { VidisConfig } from './vidis.config.js';

export type Config = {
    DB: Partial<DbConfig>;
    KEYCLOAK: Partial<KeycloakConfig>;
    REDIS: Partial<RedisConfig>;
    LDAP: Partial<LdapServerConfig>;
    FRONTEND: Partial<FrontendConfig>;
    FEATUREFLAG: Partial<FeatureFlagConfig>;
    HOST: Partial<HostConfig>;
    ITSLEARNING: Partial<ItsLearningConfig>;
    PRIVACYIDEA: Partial<PrivacyIdeaConfig>;
    OX: Partial<OxServerConfig>;
    SYSTEM: Partial<SystemConfig>;
    VIDIS: Partial<VidisConfig>;
    IMPORT: Partial<ImportConfig>;
    HEADER_API_KEY: Partial<HeaderApiKeyConfig>;
    KAFKA: Partial<KafkaConfig>;
    PORTAL: Partial<PortalConfig>;
    CRON: Partial<CronConfig>;
    EMAIL_MICROSERVICE: Partial<EmailMicroserviceConfig>;
    SCHULCONNEX: Partial<SchulconnexConfig>;
};

export default (): Config => ({
    DB: {
        DB_NAME: process.env['DB_NAME'],
        USERNAME: process.env['DB_USERNAME'],
        SECRET: process.env['DB_SECRET'],
        CLIENT_URL: process.env['DB_CLIENT_URL'],
    },
    KEYCLOAK: {
        ADMIN_SECRET: process.env['KC_ADMIN_SECRET'],
        CLIENT_SECRET: process.env['KC_CLIENT_SECRET'],
        SERVICE_CLIENT_PRIVATE_JWKS: process.env['KC_SERVICE_CLIENT_PRIVATE_JWKS'],
        BASE_URL: process.env['KC_BASE_URL'],
        EXTERNAL_BASE_URL: process.env['KC_EXTERNAL_BASE_URL'],
    },
    LDAP: {
        URL: process.env['LDAP_URL'],
        BIND_DN: process.env['LDAP_BIND_DN'],
        ADMIN_PASSWORD: process.env['LDAP_ADMIN_PASSWORD'],
        OEFFENTLICHE_SCHULEN_DOMAIN: process.env['LDAP_OEFFENTLICHE_SCHULEN_DOMAIN'],
        ERSATZSCHULEN_DOMAIN: process.env['LDAP_ERSATZSCHULEN_DOMAIN'],
        BASE_DN: process.env['LDAP_BASE_DN'],
        RETRY_WRAPPER_DEFAULT_RETRIES: envToOptionalInteger('RETRY_WRAPPER_DEFAULT_RETRIES'),
    },
    FRONTEND: {
        SESSION_SECRET: process.env['FRONTEND_SESSION_SECRET'],
        OIDC_CALLBACK_URL: process.env['FRONTEND_OIDC_CALLBACK_URL'],
        DEFAULT_LOGIN_REDIRECT: process.env['FRONTEND_DEFAULT_LOGIN_REDIRECT'],
        LOGOUT_REDIRECT: process.env['FRONTEND_LOGOUT_REDIRECT'],
        STATUS_REDIRECT_URL: process.env['STATUS_REDIRECT_URL'],
    },
    FEATUREFLAG: {
        FEATURE_FLAG_ROLLE_BEARBEITEN: envToOptionalBoolean('FEATURE_FLAG_ROLLE_BEARBEITEN'),
        FEATURE_FLAG_BEFRISTUNG_BEARBEITEN: envToOptionalBoolean('FEATURE_FLAG_BEFRISTUNG_BEARBEITEN'),
        FEATURE_FLAG_ROLLE_ERWEITERN: envToOptionalBoolean('FEATURE_FLAG_ROLLE_ERWEITERN'),
        FEATURE_FLAG_SET_UEM_PASSWORD: envToOptionalBoolean('FEATURE_FLAG_SET_UEM_PASSWORD'),
        FEATURE_FLAG_SCHULISCHE_ANGEBOTE_ERSTELLEN: envToOptionalBoolean('FEATURE_FLAG_SCHULISCHE_ANGEBOTE_ERSTELLEN'),
    },
    HOST: {
        HOSTNAME: process.env['BACKEND_HOSTNAME'],
    },
    REDIS: {
        PASSWORD: process.env['REDIS_PASSWORD'],
        HOST: process.env['REDIS_HOST'],
    },
    ITSLEARNING: {
        ENABLED: envToOptionalBoolean('ITSLEARNING_ENABLED'),
        ENDPOINT: process.env['ITSLEARNING_ENDPOINT'],
        USERNAME: process.env['ITSLEARNING_USERNAME'],
        PASSWORD: process.env['ITSLEARNING_PASSWORD'],
        ROOT: process.env['ITSLEARNING_ROOT'],
        ROOT_OEFFENTLICH: process.env['ITSLEARNING_ROOT_OEFFENTLICH'],
        ROOT_ERSATZ: process.env['ITSLEARNING_ROOT_ERSATZ'],
        MAX_ATTEMPTS: envToOptionalInteger('ITSLEARNING_MAX_ATTEMPTS'),
        MAX_BATCH_SIZE: envToOptionalInteger('ITSLEARNING_MAX_BATCH_SIZE'),
        RETRY_DELAY_MS: envToOptionalInteger('ITSLEARNING_RETRY_DELAY_MS'),
    },
    PRIVACYIDEA: {
        ENDPOINT: process.env['PI_BASE_URL'],
        USERNAME: process.env['PI_ADMIN_USER'],
        PASSWORD: process.env['PI_ADMIN_PASSWORD'],
        USER_RESOLVER: process.env['PI_USER_RESOLVER'],
        REALM: process.env['PI_REALM'],
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
    SYSTEM: {
        RENAME_WAITING_TIME_IN_SECONDS: envToOptionalInteger('SYSTEM_RENAME_WAITING_TIME_IN_SECONDS'),
        STEP_UP_TIMEOUT_IN_SECONDS: envToOptionalInteger('SYSTEM_STEP_UP_TIMEOUT_IN_SECONDS'),
        STEP_UP_TIMEOUT_ENABLED: process.env['SYSTEM_STEP_UP_TIMEOUT_ENABLED']?.toLowerCase() as 'true' | 'false',
    },
    VIDIS: {
        BASE_URL: process.env['VIDIS_API_BASE_URL'],
        CLIENT_ID: process.env['VIDIS_API_CLIENT_ID'],
        CLIENT_SECRET: process.env['VIDIS_API_CLIENT_SECRET'],
        REGION: process.env['VIDIS_API_REGION'],
        SYNC_SCHOOLS_PAGE_SIZE: envToOptionalInteger('VIDIS_SYNC_SCHOOLS_PAGE_SIZE'),
    },
    IMPORT: {
        PASSPHRASE_SECRET: process.env['IMPORT_PASSPHRASE_SECRET'],
        PASSPHRASE_SALT: process.env['IMPORT_PASSPHRASE_SALT'],
        CSV_FILE_MAX_SIZE_IN_MB: envToOptionalInteger('IMPORT_CSV_FILE_MAX_SIZE_IN_MB'),
        CSV_MAX_NUMBER_OF_USERS: envToOptionalInteger('IMPORT_CSV_MAX_NUMBER_OF_USERS'),
    },
    HEADER_API_KEY: {
        INTERNAL_COMMUNICATION_API_KEY: process.env['INTERNAL_COMMUNICATION_API_KEY'],
    },
    KAFKA: {
        BROKER: process.env['KAFKA_BROKER'],
        TOPIC_PREFIX: process.env['KAFKA_TOPIC_PREFIX'],
        USER_TOPIC: process.env['KAFKA_USER_TOPIC'],
        USER_DLQ_TOPIC: process.env['KAFKA_USER_DLQ_TOPIC'],
        GROUP_ID: process.env['KAFKA_GROUP_ID'],
        SESSION_TIMEOUT: envToOptionalInteger('KAFKA_SESSION_TIMEOUT'),
        HEARTBEAT_INTERVAL: envToOptionalInteger('KAFKA_HEARTBEAT_INTERVAL'),
        ENABLED: envToOptionalBoolean('KAFKA_ENABLED'),
        SSL_ENABLED: envToOptionalBoolean('KAFKA_SSL_ENABLED'),
        SSL_CA_PATH: process.env['KAFKA_SSL_CA_PATH'],
        SSL_CERT_PATH: process.env['KAFKA_SSL_CERT_PATH'],
        SSL_KEY_PATH: process.env['KAFKA_SSL_KEY_PATH'],
    },
    PORTAL: {
        LIMITED_ROLLENART_ALLOWLIST: envToEnumArray('PORTAL_LIMITED_ROLLENART_ALLOWLIST', RollenArt),
    },
    CRON: {
        PERSON_WITHOUT_ORG_LIMIT: envToOptionalInteger('CRON_PERSON_WITHOUT_ORG_LIMIT'),
        EMAIL_ADDRESSES_DELETE_LIMIT: envToOptionalInteger('CRON_EMAIL_ADDRESSES_DELETE_LIMIT'),
    },
    EMAIL_MICROSERVICE: {
        USE_EMAIL_MICROSERVICE: envToOptionalBoolean('EMAIL_MICROSERVICE__USE_EMAIL_MICROSERVICE'),
        ENDPOINT: process.env['EMAIL_MICROSERVICE__ENDPOINT'],
    },
    SCHULCONNEX: {
        LIMIT_PERSONENINFO: envToOptionalInteger('SCHULCONNEX_LIMIT_PERSONENINFO'),
    },
});
