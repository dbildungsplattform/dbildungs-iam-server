import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Module } from '@nestjs/common';

import { InternalCommunicationApiKeyStrategy } from '../email/passport/internalcommunicationapikey.strategy.js';
import { KeycloakExternalDataAppConfig } from '../shared/config/index.js';
import { KeycloakExternalDataConfigModule } from '../shared/config/keycloak-external-data-config.module.js';

@Module({
    imports: [
        KeycloakExternalDataConfigModule,
        MikroOrmModule.forRootAsync({
            useFactory: ({ DB }: KeycloakExternalDataAppConfig) => {
                return defineConfig({
                    clientUrl: DB.CLIENT_URL,
                    user: DB.USERNAME,
                    password: DB.SECRET,
                    dbName: DB.DB_NAME,
                    forceUndefined: true,
                    entities: ['./dist/**/*.entity.js'],
                    entitiesTs: ['./src/**/*.entity.ts'],
                    metadataProvider: ReflectMetadataProvider,
                    driverOptions: {
                        ssl: DB.USE_SSL,
                    },
                });
            },
            inject: [KeycloakExternalDataAppConfig],
            driver: PostgreSqlDriver,
        }),
    ],
    providers: [InternalCommunicationApiKeyStrategy],
})
export class KeycloakExternalDataModule {}
