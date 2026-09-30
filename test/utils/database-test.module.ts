import { MikroORM } from '@mikro-orm/core';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { Migrator, TSMigrationGenerator } from '@mikro-orm/migrations';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { DynamicModule, Inject, OnModuleDestroy, Optional } from '@nestjs/common';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import { PullPolicy } from 'testcontainers';
import { DbConfig } from '../../src/shared/config/index.js';
import { startReusableContainer } from './testcontainer-reuse.js';

type DatabaseTestModuleOptions = {
    isDatabaseRequired?: boolean;
    databaseName?: string;
};

const SHARED_DB_CONTAINER_NAME: string = 'testcontainer-db';

export class DatabaseTestModule implements OnModuleDestroy {
    private static postgres: Option<StartedPostgreSqlContainer>;

    // One shared container per worker process; parallel workers share the same Docker container via reuse.
    private static startPromise: Option<Promise<StartedPostgreSqlContainer>>;

    private static async getSharedContainer(): Promise<StartedPostgreSqlContainer> {
        // Container config is kept constant (no per-test database baked in) so the reuse hash is identical across
        // workers and testcontainers actually deduplicates to a single container instead of colliding on the name.
        DatabaseTestModule.startPromise ??= startReusableContainer(() =>
            new PostgreSqlContainer('docker.io/postgres:15.3-alpine')
                .withPullPolicy(PullPolicy.defaultPolicy())
                .withReuse()
                .withName(SHARED_DB_CONTAINER_NAME)
                .start(),
        );
        DatabaseTestModule.postgres = await DatabaseTestModule.startPromise;
        return DatabaseTestModule.postgres;
    }

    // Each test gets its own database inside the shared container to stay isolated from other parallel workers.
    private static async createDatabase(container: StartedPostgreSqlContainer, dbName: string): Promise<void> {
        const result: { exitCode: number; stderr: string; output: string } = await container.exec(
            ['psql', '-U', container.getUsername(), '-d', container.getDatabase(), '-c', `CREATE DATABASE "${dbName}"`],
            { env: { PGPASSWORD: container.getPassword() } },
        );

        if (result.exitCode !== 0 && !result.stderr.includes('already exists')) {
            // eslint-disable-next-line no-restricted-syntax
            throw new Error(`Failed to create test database "${dbName}": ${result.stderr || result.output}`);
        }
    }

    public static forRoot(options?: DatabaseTestModuleOptions): DynamicModule {
        return {
            module: DatabaseTestModule,
            imports: [
                MikroOrmModule.forRootAsync({
                    useFactory: async (config: DbConfig) => {
                        const dbName: string = options?.databaseName || `${config.DB_NAME}-${randomUUID()}`;

                        let clientUrl: string = config.CLIENT_URL;
                        if (options?.isDatabaseRequired) {
                            const container: StartedPostgreSqlContainer =
                                await DatabaseTestModule.getSharedContainer();
                            await DatabaseTestModule.createDatabase(container, dbName);
                            clientUrl = container.getConnectionUri();
                        }

                        return defineConfig({
                            clientUrl,
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

    public async closeOrmsConnection(): Promise<void> {
        if (this.orm?.isConnected()) {
            await this.orm.close();
        }
    }

    public async onModuleDestroy(): Promise<void> {
        // The shared, reused container is intentionally not stopped here: other test files and parallel workers
        // rely on it. It is left running for reuse and reaped by testcontainers/Docker outside the test run.
        await this.closeOrmsConnection();
    }
}
