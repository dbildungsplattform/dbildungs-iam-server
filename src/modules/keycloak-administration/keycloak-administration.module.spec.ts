import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseTestModule, KeycloakConfigTestModule } from '../../../test/utils/index.js';
import { KeycloakUserService } from './domain/keycloak-user.service.js';
import { KeycloakAdministrationModule } from './keycloak-administration.module.js';
import { KeycloakAdminClient } from '@s3pweb/keycloak-admin-client-cjs';
import { KeycloakAdministrationService } from './domain/keycloak-admin-client.service.js';
import { RolleModule } from '../rolle/rolle.module.js';
import { PersonModule } from '../person/person.module.js';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';

describe('KeycloakAdministrationModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                CommonTestModule,
                KeycloakAdministrationModule,
                DatabaseTestModule.forRoot(),
                KeycloakConfigTestModule.forRoot(),
                RolleModule,
                PersonModule,
            ],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve KeycloakUserService', () => {
            expect(module.get(KeycloakUserService)).toBeInstanceOf(KeycloakUserService);
        });

        it('should resolve KeycloakAdminClient', () => {
            expect(module.get(KeycloakAdminClient)).toBeInstanceOf(KeycloakAdminClient);
        });

        it('should resolve KeycloakAdministrationService', () => {
            expect(module.get(KeycloakAdministrationService)).toBeInstanceOf(KeycloakAdministrationService);
        });
    });
});
