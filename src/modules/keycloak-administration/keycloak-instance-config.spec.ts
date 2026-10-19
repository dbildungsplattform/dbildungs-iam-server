import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigTestModule } from '../../../test/utils/index.js';
import { type KeycloakConfig, type ServerConfig } from '../../shared/config/index.js';
import { KeycloakInstanceConfig } from './keycloak-instance-config.js';

describe('KeycloakInstanceConfig', () => {
    let module: TestingModule;
    let sut: KeycloakInstanceConfig;
    let configService: ConfigService<ServerConfig>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule],
            providers: [KeycloakInstanceConfig.fromConfigService()],
        }).compile();

        sut = module.get(KeycloakInstanceConfig);
        configService = module.get(ConfigService);
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    it('should have correct values', () => {
        expect(sut).toEqual(configService.getOrThrow<KeycloakConfig>('KEYCLOAK'));
    });
});
