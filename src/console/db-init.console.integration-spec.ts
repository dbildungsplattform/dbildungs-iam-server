import { MikroORM } from '@mikro-orm/core';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
    ConfigTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DatabaseTestModule,
    LoggingTestModule,
} from '../../test/utils/index.js';
import { DbConfig, ServerConfig } from '../shared/config/index.js';
import { DbInitConsole } from './db-init.console.js';

describe('DbInitConsole', () => {
    let module: TestingModule;
    let sut: DbInitConsole;
    let orm: MikroORM;
    let configService: ConfigService<ServerConfig, true>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), LoggingTestModule],
            providers: [DbInitConsole],
        }).compile();
        sut = module.get(DbInitConsole);
        orm = module.get(MikroORM);
        configService = module.get(ConfigService);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('run', () => {
        describe('when database is available', () => {
            it('should initialize database with schema', async () => {
                await expect(sut.run([])).resolves.not.toThrow();
            });
        });

        describe('when database is not available', () => {
            beforeAll(async () => {
                if (await orm.schema.ensureDatabase()) {
                    await orm.schema.dropDatabase(configService.getOrThrow<DbConfig>('DB').DB_NAME);
                }
            });

            it('should create and initialize database with schema', async () => {
                await expect(sut.run([])).resolves.not.toThrow();
            });
        });
    });
});
