import { IMigrator, MigrationInfo, MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import {
    ConfigTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DatabaseTestModule,
    LoggingTestModule,
} from '../../../test/utils/index.js';
import fs from 'fs';
import { DbInitMigrationConsole } from './db-init-migration.console.js';
import { DbApplyMigrationConsole, MigrationType } from './db-apply-migration.console.js';
import { DbCreateMigrationConsole } from './db-create-migration.console.js';

describe('DbMigrateConsole', () => {
    let module: TestingModule;
    let dbMigrationInit: DbInitMigrationConsole;
    let dbMigrationCreate: DbCreateMigrationConsole;
    let dbMigrationApply: DbApplyMigrationConsole;
    let orm: MikroORM;
    let migrator: IMigrator;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), LoggingTestModule],
            providers: [DbInitMigrationConsole, DbCreateMigrationConsole, DbApplyMigrationConsole],
        }).compile();
        dbMigrationInit = module.get(DbInitMigrationConsole);
        dbMigrationCreate = module.get(DbCreateMigrationConsole);
        dbMigrationApply = module.get(DbApplyMigrationConsole);
        orm = module.get(MikroORM);
        migrator = orm.migrator;

        fs.rmSync('test-migrations', { recursive: true, force: true });
    }, 2 * DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await orm.close();
        await module.close();
    });

    it('should be defined', () => {
        expect(dbMigrationInit).toBeDefined();
        expect(dbMigrationCreate).toBeDefined();
        expect(dbMigrationApply).toBeDefined();
    });

    describe('run', () => {
        describe('when migration-init is executed', () => {
            it('should not throw an error', async () => {
                await expect(dbMigrationInit.run([])).resolves.not.toThrow();
            });
        });

        describe('when migration-create is executed', () => {
            it('should not throw an error', async () => {
                await expect(dbMigrationCreate.run([])).resolves.not.toThrow();
            });
        });

        describe('when migration-apply is executed', () => {
            it('should not throw an error', async () => {
                vi.spyOn(migrator, 'getPending').mockResolvedValueOnce([]);
                await expect(dbMigrationApply.run([])).resolves.not.toThrow();
            });
        });
    });

    describe('DbApplyMigrationConsole', () => {
        type Params = Parameters<IMigrator['up']>[0];

        beforeEach(() => {
            vi.spyOn(migrator, 'up').mockResolvedValueOnce([]);
        });

        it('should apply all pending migrations', async () => {
            const migrations: MigrationInfo[] = [{ name: '20210101_initialS' }, { name: '20210202_dataD' }];
            vi.spyOn(migrator, 'getPending').mockResolvedValueOnce(migrations);
            await dbMigrationApply.run([]);
            expect(migrator.up).toHaveBeenCalledWith(
                expect.objectContaining<Params>({
                    migrations: ['20210101_initialS'],
                }),
            );
            expect(migrator.up).toHaveBeenLastCalledWith(
                expect.objectContaining<Params>({
                    migrations: ['20210202_dataD'],
                }),
            );
        });

        it('should filter and apply only structural migrations', async () => {
            const migrations: MigrationInfo[] = [{ name: '20210101_initialS' }, { name: '20210202_dataD' }];
            vi.spyOn(migrator, 'getPending').mockResolvedValueOnce(migrations);
            await dbMigrationApply.run([], { migration: MigrationType.STRUCTURAL });
            expect(migrator.up).toHaveBeenCalledWith(
                expect.objectContaining<Params>({
                    migrations: ['20210101_initialS'],
                }),
            );
        });

        it('should filter and apply only data migrations', async () => {
            const migrations: MigrationInfo[] = [{ name: '20210101_initialS' }, { name: '20210202_dataD' }];
            vi.spyOn(migrator, 'getPending').mockResolvedValueOnce(migrations);
            await dbMigrationApply.run([], { migration: MigrationType.DATA });
            expect(migrator.up).toHaveBeenCalledWith(
                expect.objectContaining<Params>({
                    migrations: ['20210202_dataD'],
                }),
            );
        });

        it('should throw an error if any migration does not end with S or D', async () => {
            const migrations: MigrationInfo[] = [{ name: '20210101_initial' }];
            vi.spyOn(migrator, 'getPending').mockResolvedValueOnce(migrations);
            await expect(dbMigrationApply.run([])).rejects.toThrow('Not all migrations end with a S or D');
        });
    });

    describe('parseMigrationOption', () => {
        it('should return STRUCTURAL for "structural"', () => {
            expect(dbMigrationApply.parseMigrationOption('structural')).toBe(MigrationType.STRUCTURAL);
        });

        it('should return DATA for "data"', () => {
            expect(dbMigrationApply.parseMigrationOption('data')).toBe(MigrationType.DATA);
        });

        it('should return All for any other value', () => {
            expect(dbMigrationApply.parseMigrationOption('anything')).toBe(MigrationType.All);
        });
    });
});
