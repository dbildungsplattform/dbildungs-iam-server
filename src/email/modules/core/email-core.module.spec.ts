import { Test, type TestingModule } from '@nestjs/testing';
import { EmailCoreModule } from './email-core.module.js';
import { SetEmailAddressForSpshPersonService } from './domain/set-email-address-for-spsh-person.service.js';
import { DatabaseTestModule, EmailConfigTestModule, LoggingTestModule } from '../../../../test/utils/index.js';
import { EmailWriteController } from './api/controller/email-write.controller.js';
import { EmailReadController } from './api/controller/email-read.controller.js';

describe('EmailCoreModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [EmailCoreModule, EmailConfigTestModule, LoggingTestModule, DatabaseTestModule.forRoot()],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    it('should provide SetEmailAddressForSpshPersonService', () => {
        const service: SetEmailAddressForSpshPersonService = module.get(SetEmailAddressForSpshPersonService);
        expect(service).toBeDefined();
    });

    it('should provide EmailWriteController', () => {
        const controller: EmailWriteController = module.get(EmailWriteController);
        expect(controller).toBeDefined();
    });

    it('should provide EmailReadController', () => {
        const controller: EmailReadController = module.get(EmailReadController);
        expect(controller).toBeDefined();
    });
});
