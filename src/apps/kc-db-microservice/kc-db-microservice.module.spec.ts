import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { KcDbMicroserviceModule } from './kc-db-microservice.module.js';
import { HealthModule } from '../../modules/kc-db-health/health.module.js';

describe('AppModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [KcDbMicroserviceModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    it('should import ConfigModule', () => {
        const configModule: ConfigModule = module.get(ConfigModule);
        expect(configModule).toBeDefined();
    });

    it('should import HealthModule', () => {
        const healthModule: HealthModule = module.get(HealthModule);
        expect(healthModule).toBeDefined();
    });
});
