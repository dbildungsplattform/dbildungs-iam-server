import { EntityManager, IMigrator, MigrationInfo, MikroORM } from '@mikro-orm/core';
import { partition } from 'lodash-es';
import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { ClassLogger } from '../../core/logging/class-logger.js';
import { DbMigrationNameEndingError } from './db-migration-name-ending.error.js';

export enum MigrationType {
    STRUCTURAL = 'structural',
    DATA = 'data',
    All = 'all',
}

interface DbApplyMigrationOptions {
    migration?: MigrationType;
}

@SubCommand({ name: 'migration-apply', description: 'applies latest migration version to database' })
export class DbApplyMigrationConsole extends CommandRunner {
    public constructor(
        private readonly orm: MikroORM,
        private readonly logger: ClassLogger,
    ) {
        super();
    }

    public override async run(_passedParams: string[], options?: DbApplyMigrationOptions): Promise<void> {
        this.logger.info('Migrating to latest version...');
        const migrator: IMigrator = this.orm.migrator;
        const migrationType: MigrationType = (options?.['migration'] as MigrationType) || MigrationType.All;

        const allMigrations: MigrationInfo[] = await migrator.getPending();
        if (
            !allMigrations
                .map((migration: MigrationInfo) => migration.name)
                .every((name: string) => name.endsWith('S') || name.endsWith('D'))
        ) {
            throw new DbMigrationNameEndingError();
        }
        this.logger.info(`${allMigrations.length} pending migrations`);

        const [structuralMigrations, dataMigrations]: [MigrationInfo[], MigrationInfo[]] = partition(
            allMigrations,
            (migration: MigrationInfo) => migration.name.endsWith('S'),
        );
        if (migrationType === MigrationType.All || migrationType === MigrationType.STRUCTURAL) {
            this.logger.info(`Applying ${structuralMigrations.length} ${MigrationType.STRUCTURAL} migrations...`);
            await this.orm.em.transactional(async (em: EntityManager) => {
                await migrator.up({
                    migrations: structuralMigrations.map((migration: MigrationInfo) => migration.name),
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    transaction: em.getTransactionContext(),
                });
            });
        }
        if (migrationType === MigrationType.All || migrationType === MigrationType.DATA) {
            this.logger.info(`Applying ${dataMigrations.length} ${MigrationType.DATA} migrations...`);
            await this.orm.em.transactional(async (em: EntityManager) => {
                await migrator.up({
                    migrations: dataMigrations.map((migration: MigrationInfo) => migration.name),
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    transaction: em.getTransactionContext(),
                });
            });
        }

        this.logger.info('Finished migration to latest version.');
    }

    @Option({
        flags: '-m, --migration [migration]',
        description: 'The migrations to apply',
    })
    public parseMigrationOption(val: string): MigrationType {
        switch (val) {
            case 'structural':
                return MigrationType.STRUCTURAL;
            case 'data':
                return MigrationType.DATA;
            default:
                return MigrationType.All;
        }
    }
}
