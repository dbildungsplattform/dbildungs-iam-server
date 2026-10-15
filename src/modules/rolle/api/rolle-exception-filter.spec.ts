import { type ArgumentsHost } from '@nestjs/common';
import { type Response } from 'express';
import { RolleExceptionFilter } from './rolle-exception-filter.js';
import { DbiamRolleError, RolleErrorI18nTypes } from './dbiam-rolle.error.js';
import { RolleDomainError } from '../domain/rolle-domain.error.js';
import { createArgumentsHostMock, createResponseMock } from '../../../../test/utils/http.mocks.js';
import { type MockedObject } from 'vitest';

describe('RolleExceptionFilter', () => {
    let filter: RolleExceptionFilter;
    const statusCode: number = 500;
    let responseMock: MockedObject<Response>;
    let argumentsHost: MockedObject<ArgumentsHost>;

    const generalBadRequestError: DbiamRolleError = new DbiamRolleError({
        code: 500,
        i18nKey: RolleErrorI18nTypes.ROLLE_ERROR,
    });

    beforeEach(() => {
        filter = new RolleExceptionFilter();
        responseMock = createResponseMock();
        argumentsHost = createArgumentsHostMock({ response: responseMock });
    });

    describe('catch', () => {
        describe('when filter catches undefined error', () => {
            it('should throw a general RolleError', () => {
                const error: RolleDomainError = new RolleDomainError('error', undefined);

                filter.catch(error, argumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(generalBadRequestError);
            });
        });
    });
});
