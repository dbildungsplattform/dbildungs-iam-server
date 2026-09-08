import { MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import fs from 'node:fs';
import {
    CommonTestModule,
    DatabaseTestModule,
    EmailConfigTestModule,
    KeycloakConfigTestModule,
} from '../../../../test/utils/index.js';
import { KeycloakAdministrationModule } from '../../../modules/keycloak-administration/keycloak-administration.module.js';
import { KeycloakConfigModule } from '../../../modules/keycloak-administration/keycloak-config.module.js';
import { OrganisationModule } from '../../../modules/organisation/organisation.module.js';
import { UsernameGeneratorService } from '../../../modules/person/domain/username-generator.service.js';
import { VornameForPersonWithTrailingSpaceError } from '../../../modules/person/domain/vorname-with-trailing-space.error.js';
import { EntityAggregateMapper } from '../../../modules/person/mapper/entity-aggregate.mapper.js';
import { OxUserBlacklistRepo } from '../../../modules/person/persistence/ox-user-blacklist.repo.js';
import { PersonModule } from '../../../modules/person/person.module.js';
import { DBiamPersonenkontextRepo } from '../../../modules/personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonenKontextModule } from '../../../modules/personenkontext/personenkontext.module.js';
import { RolleModule } from '../../../modules/rolle/rolle.module.js';
import { ServiceProviderModule } from '../../../modules/service-provider/service-provider.module.js';
import { EntityNotFoundError } from '../../../shared/error/index.js';
import { DbSeedModule } from '../db-seed.module.js';
import { DbSeedService } from './db-seed.service.js';

describe('DbSeedServiceIntegration', () => {
    let module: TestingModule;
    let orm: MikroORM;
    let dbSeedService: DbSeedService;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                DbSeedModule,
                PersonModule,
                RolleModule,
                ServiceProviderModule,
                CommonTestModule,
                EmailConfigTestModule,
                OrganisationModule,
                KeycloakAdministrationModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                PersonenKontextModule,
            ],
            providers: [UsernameGeneratorService, DBiamPersonenkontextRepo, OxUserBlacklistRepo, EntityAggregateMapper],
        })
            .overrideModule(KeycloakConfigModule)
            .useModule(KeycloakConfigTestModule.forRoot({ isKeycloakRequired: true }))
            .compile();
        orm = module.get(MikroORM);
        dbSeedService = module.get(DbSeedService);

        await DatabaseTestModule.setupDatabase(module.get(MikroORM));
    }, 10000000);

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(dbSeedService).toBeDefined();
        expect(orm).toBeDefined();
    });

    describe('seedPersonenkontext', () => {
        describe('with non-existing person for personenkontext', () => {
            it('should throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/personenkontext/05_personenkontext.json`,
                    'utf-8',
                );

                await expect(dbSeedService.seedPersonenkontext(fileContentAsStr)).rejects.toThrow(EntityNotFoundError);
            });
        });

        describe('with non-existing organisation for personenkontext', () => {
            it('should throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/personenkontext/05_personenkontext.json`,
                    'utf-8',
                );
                const fileContentPersonAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/personenkontext/02_person.json`,
                    'utf-8',
                );
                await dbSeedService.seedPerson(fileContentPersonAsStr);
                await expect(dbSeedService.seedPersonenkontext(fileContentAsStr)).rejects.toThrow(EntityNotFoundError);
            });
        });

        describe('with non-existing rolle for personenkontext', () => {
            it('should throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/personenkontext/05_personenkontext.json`,
                    'utf-8',
                );
                const fileContentOrganisationAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/personenkontext/01_organisation.json`,
                    'utf-8',
                );
                await dbSeedService.seedOrganisation(fileContentOrganisationAsStr);

                await expect(dbSeedService.seedPersonenkontext(fileContentAsStr)).rejects.toThrow(EntityNotFoundError);
            });
        });
    });

    describe('seedPerson', () => {
        describe('when personFactory is failing', () => {
            it('should throw error', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/invalidPerson/02_person.json`,
                    'utf-8',
                );
                await expect(dbSeedService.seedPerson(fileContentAsStr)).rejects.toThrow(
                    VornameForPersonWithTrailingSpaceError,
                );
            });
        });
    });
});
