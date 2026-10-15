import { faker } from '@faker-js/faker';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { AxiosError, type AxiosResponse } from 'axios';
import { concat, of, throwError } from 'rxjs';

import { EmailConfigTestModule, LoggingTestModule } from '../../../../../test/utils/index.js';
import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { WebhookService } from './webhook.service.js';

describe('WebhookService', () => {
    let module: TestingModule;
    let sut: WebhookService;
    let httpServiceMock: DeepMocked<HttpService>;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [EmailConfigTestModule, LoggingTestModule],
            providers: [
                WebhookService,
                {
                    provide: HttpService,
                    useValue: createMock(HttpService),
                },
            ],
        }).compile();

        sut = module.get(WebhookService);
        httpServiceMock = module.get(HttpService);
        loggerMock = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('sendEmailsChanged', () => {
        const spshPersonId: string = faker.string.uuid();
        const previousPrimaryEmail: string = faker.internet.email();
        const previousAlternativeEmail: string = faker.internet.email();
        const newPrimaryEmail: string = faker.internet.email();
        const newAlternativeEmail: string = faker.internet.email();

        it('should send POST request with data', () => {
            httpServiceMock.post.mockReturnValueOnce(of({} as AxiosResponse));

            sut.sendEmailsChanged({
                spshPersonId,
                newPrimaryEmail,
                newAlternativeEmail,
                previousPrimaryEmail,
                previousAlternativeEmail,
            });

            expect(httpServiceMock.post).toHaveBeenCalledWith(
                'http://localhost:9090/api/email-webhook/changed',
                {
                    spshPersonId,
                    newPrimaryEmail,
                    newAlternativeEmail,
                    previousPrimaryEmail,
                    previousAlternativeEmail,
                },
                {
                    headers: {
                        'api-key': 'api-key',
                    },
                },
            );
            expect(loggerMock.info).toHaveBeenCalledWith(
                `Webhook notification for person ${spshPersonId} was successful.`,
            );
        });

        it('should retry if request fails', () => {
            const error: AxiosError = new AxiosError('test-error');
            httpServiceMock.post.mockReturnValueOnce(
                concat(
                    // throw error on first try
                    throwError(() => error),
                    // succeed on second try
                    of({} as AxiosResponse),
                ),
            );

            sut.sendEmailsChanged({
                spshPersonId,
                newPrimaryEmail,
                newAlternativeEmail,
                previousPrimaryEmail,
                previousAlternativeEmail,
            });

            vi.advanceTimersByTime(10000);

            expect(httpServiceMock.post).toHaveBeenCalledWith(
                'http://localhost:9090/api/email-webhook/changed',
                {
                    spshPersonId,
                    newPrimaryEmail,
                    newAlternativeEmail,
                    previousPrimaryEmail,
                    previousAlternativeEmail,
                },
                {
                    headers: {
                        'api-key': 'api-key',
                    },
                },
            );

            expect(loggerMock.logUnknownAsWarning).toHaveBeenCalledWith(
                `Webhook notification for person ${spshPersonId} failed (Attempt #1), retrying in 1000ms`,
                error,
            );
            expect(loggerMock.info).toHaveBeenCalledWith(
                `Webhook notification for person ${spshPersonId} was successful.`,
            );
        });

        it('should log error if all retries fail', () => {
            const error: AxiosError = new AxiosError('test-error');
            httpServiceMock.post.mockReturnValueOnce(
                concat(
                    throwError(() => error),
                    throwError(() => error),
                ),
            );

            sut.sendEmailsChanged({
                spshPersonId,
                newPrimaryEmail,
                newAlternativeEmail,
                previousPrimaryEmail,
                previousAlternativeEmail,
            });

            vi.advanceTimersByTime(10000);

            expect(loggerMock.logUnknownAsWarning).toHaveBeenCalledWith(
                `Webhook notification for person ${spshPersonId} failed (Attempt #1), retrying in 1000ms`,
                error,
            );
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `Webhook notification for person ${spshPersonId} failed.`,
                error,
            );
        });
    });
});
