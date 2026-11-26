import { Test, type TestingModule } from '@nestjs/testing';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';
import { EmailResolverService } from './domain/email-resolver.service.js';
import { EmailResolverModule } from './email-resolver.module.js';

describe('EmailResolverModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, EmailResolverModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should resolve EmailResolverService without database or domain modules', () => {
        expect(module.get(EmailResolverService)).toBeInstanceOf(EmailResolverService);
    });
});
