import { Global, Module } from '@nestjs/common';
import { ConfigFactoryKeyHost, ConfigModule, ConfigType, registerAs } from '@nestjs/config';

import { loadKeycloakExternalDataAppConfigFiles } from './config.loader.js';
import { DbConfig } from './db.config.js';
import { KeycloakExternalDataAppConfig } from './keycloak-external-data-app.config.js';
import { LoggingConfig } from './logging.config.js';

type NamespacedConfig<C> = (() => C) & ConfigFactoryKeyHost<C>;

const keycloakExternalDataConfig: NamespacedConfig<KeycloakExternalDataAppConfig> = registerAs(
    'keycloak-external-data',
    () => loadKeycloakExternalDataAppConfigFiles(),
);

@Global()
@Module({
    imports: [ConfigModule.forFeature(keycloakExternalDataConfig)],
    providers: [
        {
            provide: KeycloakExternalDataAppConfig,
            useFactory: (config: ConfigType<typeof keycloakExternalDataConfig>): KeycloakExternalDataAppConfig =>
                config,
            inject: [keycloakExternalDataConfig.KEY],
        },
        {
            provide: LoggingConfig,
            useFactory: (config: ConfigType<typeof keycloakExternalDataConfig>): LoggingConfig => config.LOGGING,
            inject: [keycloakExternalDataConfig.KEY],
        },
        {
            provide: DbConfig,
            useFactory: (config: ConfigType<typeof keycloakExternalDataConfig>): DbConfig => config.DB,
            inject: [keycloakExternalDataConfig.KEY],
        },
    ],
    exports: [KeycloakExternalDataAppConfig, LoggingConfig, DbConfig],
})
export class KeycloakExternalDataConfigModule {}
