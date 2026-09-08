import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'ldapts';
import { vi } from 'vitest';
import { CommonTestModule } from '../../../../../test/utils/common-test.module.js';
import {
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    LdapTestModule,
} from '../../../../../test/utils/index.js';
import { GlobalValidationPipe } from '../../../../shared/validation/global-validation.pipe.js';
import { LdapModule } from '../../ldap.module.js';
import { LdapClient } from './ldap-client.js';
import { LdapConfigModule } from './ldap-config.module.js';

describe('LDAP Client', () => {
    let app: INestApplication;
    let module: TestingModule;
    let orm: MikroORM;
    let ldapClient: LdapClient;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), LdapModule],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
            ],
        })
            .overrideModule(LdapConfigModule)
            .useModule(LdapTestModule.forRoot({ isLdapRequired: true }))
            .overrideProvider(LdapClient)
            .useClass(LdapClient)
            .compile();

        orm = module.get(MikroORM);
        ldapClient = module.get(LdapClient);

        //currently only used to wait for the LDAP container, because setupDatabase() is blocking
        await DatabaseTestModule.setupDatabase(module.get(MikroORM));
        app = module.createNestApplication();
        await app.init();
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        vi.resetAllMocks();
        await DatabaseTestModule.clearDatabase(orm);
    });

    it('should be defined', () => {
        expect(ldapClient).toBeDefined();
    });

    describe('getClient', () => {
        describe('when client is not already initialized', () => {
            it('should create a new one and return it', () => {
                const client: Client = ldapClient.getClient();

                expect(client).toBeDefined();
            });
        });
    });

    describe('disconnect', () => {
        describe('when client is initialized', () => {
            it('should disconnect and return true', async () => {
                ldapClient.getClient();

                expect(await ldapClient.disconnect()).toBeTruthy();
            });
        });

        describe('when client is NOT initialized', () => {
            it('should return false', async () => {
                expect(await ldapClient.disconnect()).toBeFalsy();
            });
        });
    });
});
