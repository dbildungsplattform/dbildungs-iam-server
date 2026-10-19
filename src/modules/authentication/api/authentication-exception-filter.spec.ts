import { type ArgumentsHost, UnauthorizedException } from '@nestjs/common';
import { type Response } from 'express';
import { AuthenticationDomainError } from '../domain/authentication-domain.error.js';
import { AuthenticationExceptionFilter } from './authentication-exception-filter.js';
import { AuthenticationErrorI18nTypes, DbiamAuthenticationError } from './dbiam-authentication.error.js';
import { createArgumentsHostMock, createResponseMock } from '../../../../test/utils/http.mocks.js';
import { type MockedObject } from 'vitest';

describe('AuthenticationExceptionFilter', () => {
    let filter: AuthenticationExceptionFilter;
    let responseMock: MockedObject<Response>;
    let argumentsHost: MockedObject<ArgumentsHost>;

    const generalBadRequestError: DbiamAuthenticationError = new DbiamAuthenticationError({
        code: 403,
        i18nKey: AuthenticationErrorI18nTypes.AUTHENTICATION_ERROR,
    });

    beforeEach(() => {
        filter = new AuthenticationExceptionFilter();
        responseMock = createResponseMock();
        argumentsHost = createArgumentsHostMock({ response: responseMock });
    });

    describe('catch', () => {
        describe('when filter catches undefined error', () => {
            it('should return a general AuthenticationError', () => {
                const error: AuthenticationDomainError = new AuthenticationDomainError('error', undefined);

                filter.catch(error, argumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(generalBadRequestError.code);
                expect(responseMock.json).toHaveBeenCalledWith(generalBadRequestError);
            });
        });

        describe('when filter catches UnauthorizedException', () => {
            it('should return a mapped AuthenticationError', () => {
                const error: UnauthorizedException = new UnauthorizedException();
                const expectedError: DbiamAuthenticationError = new DbiamAuthenticationError({
                    code: 401,
                    i18nKey: AuthenticationErrorI18nTypes.UNAUTHORIZED,
                });

                filter.catch(error, argumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(expectedError.code);
                expect(responseMock.json).toHaveBeenCalledWith(expectedError);
            });
        });
    });
});
