import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigTestModule } from '../../../test/utils/index.js';
import { KeycloakConfigModule } from './keycloak-config.module.js';
import { KeycloakInstanceConfig } from './keycloak-instance-config.js';

describe('KeycloakConfigModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, KeycloakConfigModule],
            providers: [],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve KeycloakInstanceConfig', () => {
            expect(module.get(KeycloakInstanceConfig)).toBeInstanceOf(KeycloakInstanceConfig);
        });
    });
});
