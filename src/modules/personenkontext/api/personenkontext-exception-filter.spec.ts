import { ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import { PersonenkontextExceptionFilter } from './personenkontext-exception-filter.js';
import { PersonenkontextSpecificationError } from '../specification/error/personenkontext-specification.error.js';
import { PersonalnummerWithoutKoperspflichtError } from '../../../shared/error/personalnummer-without-koperspflicht.error.js';
import {
    DbiamPersonenkontextError,
    PersonenkontextSpecificationErrorI18nTypes,
} from './dbiam-personenkontext.error.js';
import { createArgumentsHostMock, createResponseMock } from '../../../../test/utils/http.mocks.js';
import { MockedObject } from 'vitest';

describe('PersonenkontextExceptionFilter', () => {
    let filter: PersonenkontextExceptionFilter;
    const statusCode: number = 400;
    let responseMock: MockedObject<Response>;
    let argumentsHost: MockedObject<ArgumentsHost>;

    const generalBadRequestError: DbiamPersonenkontextError = new DbiamPersonenkontextError({
        code: 500,
        i18nKey: PersonenkontextSpecificationErrorI18nTypes.PERSONENKONTEXT_SPECIFICATION_ERROR,
    });

    beforeEach(() => {
        filter = new PersonenkontextExceptionFilter();
        responseMock = createResponseMock();
        argumentsHost = createArgumentsHostMock({ response: responseMock });
    });

    describe('catch', () => {
        describe('when filter catches undefined error', () => {
            it('should throw a general PersonenkontextSpecificationError', () => {
                const error: PersonenkontextSpecificationError = new PersonenkontextSpecificationError('error');

                filter.catch(error, argumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(generalBadRequestError);
            });
        });

        describe('when filter catches PersonalnummerWithoutKoperspflichtError', () => {
            it('should return a bad request with PERSON_HAT_KEINE_KOPERSPFLICHTIGE_ROLLE i18nKey', () => {
                const error: PersonalnummerWithoutKoperspflichtError = new PersonalnummerWithoutKoperspflichtError();

                filter.catch(error, argumentsHost);

                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(
                    new DbiamPersonenkontextError({
                        code: 400,
                        i18nKey: PersonenkontextSpecificationErrorI18nTypes.PERSON_HAT_KEINE_KOPERSPFLICHTIGE_ROLLE,
                    }),
                );
            });
        });
    });
});
