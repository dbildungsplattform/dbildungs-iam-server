import { Test, type TestingModule } from '@nestjs/testing';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';
import { EmailResolverService } from './domain/email-resolver.service.js';
import { EmailMicroserviceClientModule } from './email-microservice-client.module.js';

describe('EmailMicroserviceClientModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, EmailMicroserviceClientModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should resolve EmailResolverService without database or domain modules', () => {
        expect(module.get(EmailResolverService)).toBeInstanceOf(EmailResolverService);
    });
});
