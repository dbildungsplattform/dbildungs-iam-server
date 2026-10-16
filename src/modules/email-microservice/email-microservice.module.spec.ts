import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseTestModule } from '../../../test/utils/index.js';
import { EmailMicroserviceEventHandler } from './domain/email-microservice-event-handler.js';
import { EmailResolverService } from './domain/email-resolver.service.js';
import { EmailMicroserviceModule } from './email-microservice.module.js';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';

describe('EmailMicroserviceModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot(), EmailMicroserviceModule],
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
        it('should resolve EmailResolverService', () => {
            expect(module.get(EmailResolverService)).toBeInstanceOf(EmailResolverService);
        });

        it('should resolve EmailMicroserviceEventHandler', () => {
            expect(module.get(EmailMicroserviceEventHandler)).toBeInstanceOf(EmailMicroserviceEventHandler);
        });
    });
});
