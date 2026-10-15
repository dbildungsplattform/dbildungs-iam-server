import { type ArgumentsHost } from '@nestjs/common';
import { type Response } from 'express';
import { EmailExceptionFilter } from './email-exception-filter.js';
import { EmailDomainNotFoundError } from './email-domain-not-found.error.js';
import { EmailAddressNotFoundError } from './email-address-not-found.error.js';
import { EmailAddressGenerationAttemptsExceededError } from './email-address-generation-attempts-exceeds.error.js';
import { type DomainError } from '../../../../shared/error/index.js';
import { createArgumentsHostMock, createResponseMock } from '../../../../../test/utils/http.mocks.js';
import { type MockedObject } from 'vitest';

describe('EmailExceptionFilter', () => {
    let filter: EmailExceptionFilter;
    let responseMock: MockedObject<Response>;
    let argumentsHost: MockedObject<ArgumentsHost>;

    beforeEach(() => {
        filter = new EmailExceptionFilter();
        responseMock = createResponseMock();
        argumentsHost = createArgumentsHostMock({ response: responseMock });
    });

    describe('catch', () => {
        it('should map EmailDomainNotFoundError to correct response', () => {
            const error: EmailDomainNotFoundError = new EmailDomainNotFoundError('domain');
            filter.catch(error, argumentsHost);

            expect(responseMock.status).toHaveBeenCalledWith(404);
            expect(responseMock.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: 404,
                    emailErrorCode: 'EMAIL_DOMAIN_NOT_FOUND',
                }),
            );
        });

        it('should map EmailAddressNotFoundError to correct response', () => {
            const error: EmailAddressNotFoundError = new EmailAddressNotFoundError('address');
            filter.catch(error, argumentsHost);

            expect(responseMock.status).toHaveBeenCalledWith(404);
            expect(responseMock.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: 404,
                    emailErrorCode: 'EMAIL_ADDRESS_NOT_FOUND',
                }),
            );
        });

        it('should map EmailAddressGenerationAttemptsExceededError to correct response', () => {
            const error: EmailAddressGenerationAttemptsExceededError =
                new EmailAddressGenerationAttemptsExceededError();
            filter.catch(error, argumentsHost);

            expect(responseMock.status).toHaveBeenCalledWith(400);
            expect(responseMock.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: 400,
                    emailErrorCode: 'EMAIL_ADDRESS_GENERATION_ATTEMPTS_EXCEEDED',
                }),
            );
        });

        it('should map unknown error to UNKNOWN_ERROR response', () => {
            // Simulate an unknown error type
            const error: object = { constructor: { name: 'SomeUnknownError' } };
            filter.catch(error as DomainError, argumentsHost);

            expect(responseMock.status).toHaveBeenCalledWith(500);
            expect(responseMock.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: 500,
                    emailErrorCode: 'UNKNOWN_ERROR',
                }),
            );
        });
    });
});
