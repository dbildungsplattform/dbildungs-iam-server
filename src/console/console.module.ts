import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { Migrator, TSMigrationGenerator } from '@mikro-orm/migrations';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LdapModule } from '../core/ldap/ldap.module.js';
import { LoggerModule } from '../core/logging/logger.module.js';
import { KeycloakAdministrationModule } from '../modules/keycloak-administration/keycloak-administration.module.js';
import { KeycloakConfigModule } from '../modules/keycloak-administration/keycloak-config.module.js';
import { OrganisationModule } from '../modules/organisation/organisation.module.js';
import { PersonModule } from '../modules/person/person.module.js';
import { PersonenKontextModule } from '../modules/personenkontext/personenkontext.module.js';
import { RolleModule } from '../modules/rolle/rolle.module.js';
import { ServiceProviderModule } from '../modules/service-provider/service-provider.module.js';
import {
    DbConfig,
    EmailConfigModule,
    loadConfigFiles,
    ServerConfig,
    ServerConfigModule,
} from '../shared/config/index.js';
import { DbInitConsole } from './db-init.console.js';
import { DbConsole } from './db.console.js';
import { DbApplyMigrationConsole } from './dbmigrate/db-apply-migration.console.js';
import { DbCreateMigrationConsole } from './dbmigrate/db-create-migration.console.js';
import { DbInitMigrationConsole } from './dbmigrate/db-init-migration.console.js';
import { DbSeedDataGeneratorConsole } from './dbseed/db-seed-data-generator.console.js';
import { DbSeedConsole } from './dbseed/db-seed.console.js';
import { DbSeedModule } from './dbseed/db-seed.module.js';

@Module({
    imports: [
        OrganisationModule,
        KeycloakConfigModule,
        KeycloakAdministrationModule,
        PersonModule,
        RolleModule,
        ServiceProviderModule,
        PersonenKontextModule,
        LdapModule,
        DbSeedModule,
        LoggerModule.register(ConsoleModule.name),
        ConfigModule.forRoot({
            isGlobal: true,
            load: [loadConfigFiles],
        }),
        ServerConfigModule,
        EmailConfigModule,
        MikroOrmModule.forRootAsync({
            useFactory: (config: ConfigService<ServerConfig, true>) => {
                return defineConfig({
                    clientUrl: config.getOrThrow<DbConfig>('DB').CLIENT_URL,
                    dbName: config.getOrThrow<DbConfig>('DB').DB_NAME,
                    user: config.getOrThrow<DbConfig>('DB').USERNAME,
                    password: config.getOrThrow<DbConfig>('DB').SECRET,
                    entities: ['./dist/**/*.entity.js'],
                    entitiesTs: ['./src/**/*.entity.ts'],
                    extensions: [Migrator],
                    metadataProvider: ReflectMetadataProvider,
                    migrations: {
                        tableName: 'mikro_orm_migrations', // name of database table with log of executed transactions
                        path: './dist/migrations', // path to the folder with migrations
                        pathTs: './migrations', // path to the folder with TS migrations (if used, you should put path to compiled files in `path`)
                        glob: '!(*.d).{js,ts}', // how to match migration files (all .js and .ts files, but not .d.ts)
                        transactional: true, // wrap each migration in a transaction
                        disableForeignKeys: false, // wrap statements with `set foreign_key_checks = 0` or equivalent
                        allOrNothing: true, // wrap all migrations in master transaction
                        dropTables: true, // allow to disable table dropping
                        safe: false, // allow to disable table and column dropping
                        snapshot: true, // save snapshot when creating new migrations
                        emit: 'ts', // migration generation mode
                        generator: TSMigrationGenerator, // migration generator, e.g. to allow custom formatting
                    },
                    driverOptions: {
                        ssl: config.getOrThrow<DbConfig>('DB').USE_SSL,
                    },
                    allowGlobalContext: true,
                });
            },
            inject: [ConfigService],
            driver: PostgreSqlDriver,
        }),
    ],
    providers: [
        DbConsole,
        DbInitConsole,
        DbSeedConsole,
        DbInitMigrationConsole,
        DbCreateMigrationConsole,
        DbApplyMigrationConsole,
        DbSeedDataGeneratorConsole,
    ],
})
export class ConsoleModule {}
