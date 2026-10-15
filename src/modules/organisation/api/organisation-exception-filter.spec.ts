import { type ArgumentsHost } from '@nestjs/common';
import { type Response } from 'express';
import { OrganisationExceptionFilter } from './organisation-exception-filter.js';
import { OrganisationSpecificationError } from '../specification/error/organisation-specification.error.js';
import { DbiamOrganisationError, OrganisationSpecificationErrorI18nTypes } from './dbiam-organisation.error.js';
import { createArgumentsHostMock, createResponseMock } from '../../../../test/utils/http.mocks.js';
import { type MockedObject } from 'vitest';

describe('OrganisationExceptionFilter', () => {
    let filter: OrganisationExceptionFilter;
    const statusCode: number = 400;
    let responseMock: MockedObject<Response>;
    let argumentsHost: MockedObject<ArgumentsHost>;

    const generalBadRequestError: DbiamOrganisationError = new DbiamOrganisationError({
        code: 500,
        i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_SPECIFICATION_ERROR,
    });

    beforeEach(() => {
        filter = new OrganisationExceptionFilter();
        responseMock = createResponseMock();
        argumentsHost = createArgumentsHostMock({ response: responseMock });
    });

    describe('catch', () => {
        describe('when filter catches undefined error', () => {
            it('should throw a general OrganisationSpecificationError', () => {
                const error: OrganisationSpecificationError = new OrganisationSpecificationError('error', undefined);

                filter.catch(error, argumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(generalBadRequestError);
            });
        });
    });
});
