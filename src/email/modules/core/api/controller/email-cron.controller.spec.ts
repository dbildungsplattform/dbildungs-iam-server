import { vi } from 'vitest';
import { createMock, type DeepMocked } from '../../../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { APP_PIPE } from '@nestjs/core';
import { GlobalValidationPipe } from '../../../../../shared/validation/global-validation.pipe.js';
import {
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    EmailConfigTestModule,
    LoggingTestModule,
} from '../../../../../../test/utils/index.js';
import { EmailOxModule } from '../../../ox/email-ox.module.js';
import { EmailCronController } from './email-cron.controller.js';
import { CronDeleteEmailsAddressesService } from '../../domain/cron-delete-email-addresses.service.js';
import { ClassLogger } from '../../../../../core/logging/class-logger.js';

describe('EmailCronController', () => {
    let emailCronController: EmailCronController;
    let cronDeleteEmailsAddressesService: DeepMocked<CronDeleteEmailsAddressesService>;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [LoggingTestModule, EmailOxModule, EmailConfigTestModule],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                EmailCronController,
                CronDeleteEmailsAddressesService,
            ],
        })
            .overrideProvider(CronDeleteEmailsAddressesService)
            .useValue(createMock(CronDeleteEmailsAddressesService))
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .compile();

        emailCronController = module.get(EmailCronController);
        cronDeleteEmailsAddressesService = module.get(CronDeleteEmailsAddressesService);
        loggerMock = module.get(ClassLogger);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('findEmailAddress', () => {
        it('should successfully call deleteEmails', () => {
            cronDeleteEmailsAddressesService.deleteEmailAddresses.mockResolvedValue(undefined);
            const result: void = emailCronController.deleteEmails();
            expect(result).toEqual(undefined);
        });

        it('should catch and log unexpected error from deleteEmails', async () => {
            cronDeleteEmailsAddressesService.deleteEmailAddresses.mockRejectedValue(new Error('Unexpected Error'));
            const result: void = emailCronController.deleteEmails();
            await Promise.resolve();
            expect(result).toEqual(undefined);

            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                expect.stringContaining('Unexpected Error during deleteEmailAddresses'),
                expect.any(Error),
            );
        });
    });
});
