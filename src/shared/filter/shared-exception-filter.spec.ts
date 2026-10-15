import { type ArgumentsHost } from '@nestjs/common';
import { type Response } from 'express';
import { type MockedObject } from 'vitest';
import { createResponseMock, createArgumentsHostMock } from '../../../test/utils/http.mocks.js';
import { AuthenticationDomainError } from '../../modules/authentication/domain/authentication-domain.error.js';
import { DbiamSharedError, SharedErrorI18nTypes } from '../error/dbiam-shared.error.js';
import { SharedExceptionFilter } from './shared-exception-filter.js';
import { EntityNotFoundError } from '../error/entity-not-found.error.js';

describe('SharedExceptionFilter', () => {
    let filter: SharedExceptionFilter;
    const statusCode: number = 500;
    let responseMock: MockedObject<Response>;
    let argumentsHost: MockedObject<ArgumentsHost>;

    const generalSharedError: DbiamSharedError = new DbiamSharedError({
        code: 500,
        i18nKey: SharedErrorI18nTypes.INTERNAL,
    });

    const entityNotFoundError: DbiamSharedError = new DbiamSharedError({
        code: 404,
        i18nKey: SharedErrorI18nTypes.ENTITY_NOT_FOUND,
    });

    beforeEach(() => {
        filter = new SharedExceptionFilter();
        responseMock = createResponseMock();
        argumentsHost = createArgumentsHostMock({ response: responseMock });
    });

    describe('catch', () => {
        describe('when filter catches undefined error', () => {
            it('should throw a general AuthenticationError', () => {
                const error: AuthenticationDomainError = new AuthenticationDomainError('error', undefined);

                filter.catch(error, argumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(generalSharedError);
            });
        });

        describe('when filter catches an entityNotFoundError error', () => {
            it('should throw a dbiam shared exception', () => {
                const entityNotFoundDomainError: EntityNotFoundError = new EntityNotFoundError(
                    'Entität konnte nicht gefunden werden',
                );
                filter.catch(entityNotFoundDomainError, argumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(entityNotFoundError.code);
                expect(responseMock.json).toHaveBeenCalledWith(entityNotFoundError);
            });
        });
    });
});
