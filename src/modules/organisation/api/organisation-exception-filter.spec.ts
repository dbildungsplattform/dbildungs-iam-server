import { ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import { MockedObject } from 'vitest';
import { createArgumentsHostMock, createResponseMock } from '../../../../test/utils/http.mocks.js';
import { BehoerdeAdministriertVonError } from '../specification/error/behoerde-administriert-von.error.js';
import { BehoerdeNameEindeutigError } from '../specification/error/behoerde-name-eindeutig.error.js';
import { OrganisationSpecificationError } from '../specification/error/organisation-specification.error.js';
import { DbiamOrganisationError, OrganisationSpecificationErrorI18nTypes } from './dbiam-organisation.error.js';
import { OrganisationExceptionFilter } from './organisation-exception-filter.js';

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
        it('should map BehoerdeNameEindeutigError to its validation key', () => {
            const error: BehoerdeNameEindeutigError = new BehoerdeNameEindeutigError();

            filter.catch(error, argumentsHost);

            expect(responseMock.status).toHaveBeenCalledWith(statusCode);
            expect(responseMock.json).toHaveBeenCalledWith(
                new DbiamOrganisationError({
                    code: 400,
                    i18nKey: OrganisationSpecificationErrorI18nTypes.BEHOERDE_NAME_EINDEUTIG,
                }),
            );
        });

        it('should map BehoerdeAdministriertVonError to its validation key', () => {
            const error: BehoerdeAdministriertVonError = new BehoerdeAdministriertVonError();

            filter.catch(error, argumentsHost);

            expect(responseMock.status).toHaveBeenCalledWith(statusCode);
            expect(responseMock.json).toHaveBeenCalledWith(
                new DbiamOrganisationError({
                    code: 400,
                    i18nKey: OrganisationSpecificationErrorI18nTypes.BEHOERDE_ADMINISTRIERT_VON,
                }),
            );
        });

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
