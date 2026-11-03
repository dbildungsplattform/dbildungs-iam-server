import { Test, type TestingModule } from '@nestjs/testing';

import { ConfigTestModule } from '../../../test/utils/index.js';
import { EventModule } from './event.module.js';
import { EventService } from './services/event.service.js';

describe('EventModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [EventModule, ConfigTestModule],
        }).compile();

        await module.init();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    it('should export EventService', () => {
        expect(module.get(EventService)).toBeDefined();
    });
});
