import { type ArgumentsHost } from '@nestjs/common';
import { type Response } from 'express';
import { PersonDomainError } from '../domain/person-domain.error.js';
import { DbiamPersonError, PersonErrorI18nTypes } from './dbiam-person.error.js';
import { PersonExceptionFilter } from './person-exception-filter.js';
import { createArgumentsHostMock, createResponseMock } from '../../../../test/utils/http.mocks.js';
import { type MockedObject } from 'vitest';

describe('PersonExceptionFilter', () => {
    let filter: PersonExceptionFilter;
    const statusCode: number = 500;
    let responseMock: MockedObject<Response>;
    let argumentsHost: MockedObject<ArgumentsHost>;

    const generalBadRequestError: DbiamPersonError = new DbiamPersonError({
        code: 500,
        i18nKey: PersonErrorI18nTypes.PERSON_ERROR,
    });

    beforeEach(() => {
        filter = new PersonExceptionFilter();
        responseMock = createResponseMock();
        argumentsHost = createArgumentsHostMock({ response: responseMock });
    });

    describe('catch', () => {
        describe('when filter catches undefined error', () => {
            it('should throw a general PersonError', () => {
                const error: PersonDomainError = new PersonDomainError('error', undefined);

                filter.catch(error, argumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(generalBadRequestError);
            });
        });
    });
});
