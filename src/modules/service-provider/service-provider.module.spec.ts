import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigTestModule, DatabaseTestModule } from '../../../test/utils/index.js';
import { ServiceProviderModule } from './service-provider.module.js';
import { EventModule } from '../../core/eventbus/index.js';

describe('ServiceProviderModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot(), ServiceProviderModule, EventModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });
});
