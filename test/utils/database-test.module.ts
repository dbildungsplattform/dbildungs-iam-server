import { MikroORM } from '@mikro-orm/core';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { Migrator, TSMigrationGenerator } from '@mikro-orm/migrations';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { DynamicModule, Inject, OnModuleDestroy, Optional } from '@nestjs/common';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomInt, randomUUID } from 'node:crypto';
import { PullPolicy } from 'testcontainers';
import { DbConfig } from '../../src/shared/config/index.js';

type DatabaseTestModuleOptions = {
    isDatabaseRequired?: boolean;
    databaseName?: string;
};

export class DatabaseTestModule implements OnModuleDestroy {
    private static postgres: Option<StartedPostgreSqlContainer>;

    public static forRoot(options?: DatabaseTestModuleOptions): DynamicModule {
        return {
            module: DatabaseTestModule,
            imports: [
                MikroOrmModule.forRootAsync({
                    useFactory: async (config: DbConfig) => {
                        const dbName: string = options?.databaseName || `${config.DB_NAME}-${randomUUID()}`;

                        if (options?.isDatabaseRequired) {
                            this.postgres = await new PostgreSqlContainer('docker.io/postgres:15.3-alpine')
                                .withDatabase(dbName)
                                .withPullPolicy(PullPolicy.defaultPolicy())
                                .withReuse() // do not work for different containers names setted by withName()
                                .withName(`testcontainer-db-${randomInt(0, 10000)}`)
                                .start();
                        }

                        return defineConfig({
                            clientUrl: this.postgres?.getConnectionUri() || config.CLIENT_URL,
                            dbName,
                            dynamicImportProvider: (id: string) => import(id),
                            entities: ['./dist/**/*.entity.js'],
                            entitiesTs: ['./src/**/*.entity.ts'],
                            metadataProvider: ReflectMetadataProvider,
                            driver: PostgreSqlDriver,
                            allowGlobalContext: true,
                            extensions: [Migrator],
                            forceUndefined: true,
                            migrations: {
                                tableName: 'mikro_orm_migrations', // name of database table with log of executed transactions
                                path: './test-migrations', // path to the folder with migrations
                                pathTs: './test-migrations', // path to the folder with TS migrations (if used, you should put path to compiled files in `path`)
                                glob: '!(*.d).{js,ts}', // how to match migration files (all .js and .ts files, but not .d.ts)
                                transactional: true, // wrap each migration in a transaction
                                disableForeignKeys: true, // wrap statements with `set foreign_key_checks = 0` or equivalent
                                allOrNothing: true, // wrap all migrations in master transaction
                                dropTables: true, // allow to disable table dropping
                                safe: false, // allow to disable table and column dropping
                                snapshot: true, // save snapshot when creating new migrations
                                emit: 'ts', // migration generation mode
                                generator: TSMigrationGenerator, // migration generator, e.g. to allow custom formatting
                            },
                        });
                    },
                    driver: PostgreSqlDriver,
                    inject: [DbConfig],
                }),
            ],
        };
    }

    public static async setupDatabase(orm: MikroORM): Promise<void> {
        await orm.em.getConnection().execute('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        await orm.schema.create();
    }

    public static async clearDatabase(orm: MikroORM): Promise<void> {
        // Explicitly clear default and email schema
        await Promise.all([orm.schema.clear(), orm.schema.clear({ schema: 'email' })]);
    }

    public constructor(@Optional() @Inject(MikroORM) private orm?: MikroORM) {}

    public static async stopContainer(): Promise<void> {
        await DatabaseTestModule.postgres?.stop();
    }

    public async closeOrmsConnection(): Promise<void> {
        if (this.orm?.isConnected()) {
            await this.orm.close();
        }
    }

    public async onModuleDestroy(): Promise<void> {
        await this.closeOrmsConnection();
        await DatabaseTestModule.stopContainer();
    }
}
