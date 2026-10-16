import { type ArgumentsHost } from '@nestjs/common';
import { type Response } from 'express';
import { MeldungExceptionFilter } from './meldung.exception-filter.js';
import { DbiamMeldungError, MeldungErrorI18nTypes } from './dbiam-meldung.error.js';
import { MeldungDomainError } from '../domain/meldung-domain.error.js';
import { createArgumentsHostMock, createResponseMock } from '../../../../test/utils/http.mocks.js';
import { type MockedObject } from 'vitest';

describe('MeldungExceptionFilter', () => {
    let filter: MeldungExceptionFilter;
    const statusCode: number = 500;
    let responseMock: MockedObject<Response>;
    let argumentsHost: MockedObject<ArgumentsHost>;

    const generalBadRequestError: DbiamMeldungError = new DbiamMeldungError({
        code: 500,
        i18nKey: MeldungErrorI18nTypes.MELDUNG_ERROR,
    });

    beforeEach(() => {
        filter = new MeldungExceptionFilter();
        responseMock = createResponseMock();
        argumentsHost = createArgumentsHostMock({ response: responseMock });
    });

    describe('catch', () => {
        describe('when filter catches undefined error', () => {
            it('should throw a general PersonError', () => {
                const error: MeldungDomainError = new MeldungDomainError('error', undefined);

                filter.catch(error, argumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(generalBadRequestError);
            });
        });
    });
});
