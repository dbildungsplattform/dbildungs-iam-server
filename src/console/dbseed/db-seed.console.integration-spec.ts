import { MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import { createMock, DeepMocked } from '../../../test/utils/createMock.js';
import {
    CommonTestModule,
    DatabaseTestModule,
    EmailConfigTestModule,
    KeycloakConfigTestModule,
} from '../../../test/utils/index.js';
import { ClassLogger } from '../../core/logging/class-logger.js';
import { KeycloakAdministrationModule } from '../../modules/keycloak-administration/keycloak-administration.module.js';
import { KeycloakConfigModule } from '../../modules/keycloak-administration/keycloak-config.module.js';
import { OrganisationModule } from '../../modules/organisation/organisation.module.js';
import { UsernameGeneratorService } from '../../modules/person/domain/username-generator.service.js';
import { EntityAggregateMapper } from '../../modules/person/mapper/entity-aggregate.mapper.js';
import { OxUserBlacklistRepo } from '../../modules/person/persistence/ox-user-blacklist.repo.js';
import { PersonModule } from '../../modules/person/person.module.js';
import { DBiamPersonenkontextRepo } from '../../modules/personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonenKontextModule } from '../../modules/personenkontext/personenkontext.module.js';
import { RolleModule } from '../../modules/rolle/rolle.module.js';
import { ServiceProviderModule } from '../../modules/service-provider/service-provider.module.js';
import { DbSeedConsole } from './db-seed.console.js';
import { DbSeedModule } from './db-seed.module.js';
import { DbSeedService } from './domain/db-seed.service.js';

describe('DbSeedConsoleIntegration', () => {
    let module: TestingModule;
    let sut: DbSeedConsole;
    let orm: MikroORM;
    let dbSeedService: DbSeedService;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                DbSeedModule,
                CommonTestModule,
                EmailConfigTestModule,
                OrganisationModule,
                KeycloakAdministrationModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                PersonModule,
                RolleModule,
                ServiceProviderModule,
                PersonenKontextModule,
            ],
            providers: [UsernameGeneratorService, DBiamPersonenkontextRepo, OxUserBlacklistRepo, EntityAggregateMapper],
        })
            .overrideModule(KeycloakConfigModule)
            .useModule(KeycloakConfigTestModule.forRoot({ isKeycloakRequired: true }))
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .compile();
        sut = module.get(DbSeedConsole);
        orm = module.get(MikroORM);
        dbSeedService = module.get(DbSeedService);
        loggerMock = module.get(ClassLogger);

        await DatabaseTestModule.setupDatabase(module.get(MikroORM));
    }, 10000000);

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    it('should be defined', () => {
        expect(dbSeedService).toBeDefined();
        expect(orm).toBeDefined();
    });

    describe('run', () => {
        describe('when parameter for directory is provided and seeding-files are valid', () => {
            it('should NOT fail', async () => {
                const params: string[] = ['seeding-integration-test/all'];
                await expect(sut.run(params)).resolves.not.toThrow();
            });
        });

        describe('when repo returns TRUE for existsSeeding', () => {
            it('should log error and abort seeding process', async () => {
                //create seeding data
                const params: string[] = ['seeding-integration-test/all'];
                await expect(sut.run(params)).resolves.not.toThrow();

                //try to run seeding again
                await expect(sut.run(params)).resolves.not.toThrow();
                expect(loggerMock.error).toHaveBeenCalledWith('Seeding data has already been created in database!');
            });
        });

        describe('when no parameter for directory is provided', () => {
            it('should fail with error', async () => {
                await expect(sut.run([])).rejects.toThrow();
            });
        });

        describe('when directory for seeding files is empty or no matching files are found within', () => {
            it('should fail with error', async () => {
                const params: string[] = ['seeding-integration-test/emptyDir'];
                await expect(sut.run(params)).rejects.toThrow();
            });
        });

        describe('when directory set via parameter', () => {
            it('should use seeding-integration-test directory and fail due to non-existing entity-type', async () => {
                const params: string[] = ['seeding-integration-test/nonExistingEntity'];
                await expect(sut.run(params)).rejects.toThrow(
                    new Error(`Unsupported EntityName / EntityType: NonExistingEntityType`),
                );
            });
        });
    });
});
