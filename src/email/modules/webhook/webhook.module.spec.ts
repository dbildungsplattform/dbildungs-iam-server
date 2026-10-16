import { Test, type TestingModule } from '@nestjs/testing';

import { EmailConfigTestModule } from '../../../../test/utils/index.js';
import { WebhookService } from './domain/webhook.service.js';
import { EmailWebhookModule } from './webhook.module.js';

describe('EmailWebhookModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [EmailWebhookModule, EmailConfigTestModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve WebhookService', () => {
            expect(module.get(WebhookService)).toBeInstanceOf(WebhookService);
        });
    });
});
