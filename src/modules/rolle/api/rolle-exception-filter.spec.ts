import { type ArgumentsHost } from '@nestjs/common';
import { type Response } from 'express';
import { type MockedObject } from 'vitest';

import { createArgumentsHostMock, createResponseMock } from '../../../../test/utils/http.mocks.js';
import { RolleDomainError } from '../domain/rolle-domain.error.js';
import { ServiceProviderNichtVerfuegbarFuerRollenerweiterungError } from '../specification/error/service-provider-nicht-verfuegbar-fuer-rollenerweiterung.error.js';
import { DbiamRolleError, RolleErrorI18nTypes } from './dbiam-rolle.error.js';
import { RolleExceptionFilter } from './rolle-exception-filter.js';

describe('RolleExceptionFilter', () => {
    let filter: RolleExceptionFilter;
    let responseMock: MockedObject<Response>;
    let argumentsHost: MockedObject<ArgumentsHost>;

    const generalBadRequestError: DbiamRolleError = new DbiamRolleError({
        code: 500,
        i18nKey: RolleErrorI18nTypes.ROLLE_ERROR,
    });

    beforeEach(() => {
        filter = new RolleExceptionFilter();
        responseMock = createResponseMock();
        argumentsHost = createArgumentsHostMock({
            response: responseMock,
        });
    });

    describe('catch', () => {
        describe('when filter catches an unmapped error', () => {
            it('should return a general RolleError', () => {
                const error: RolleDomainError = new RolleDomainError('error', undefined);

                filter.catch(error, argumentsHost);

                expect(responseMock.status).toHaveBeenCalledWith(500);
                expect(responseMock.json).toHaveBeenCalledWith(generalBadRequestError);
            });
        });

        describe('when the ServiceProvider is not available for Rollenerweiterung', () => {
            it('should return the specific ServiceProvider availability error', () => {
                const error: ServiceProviderNichtVerfuegbarFuerRollenerweiterungError =
                    new ServiceProviderNichtVerfuegbarFuerRollenerweiterungError();

                const expectedError: DbiamRolleError = new DbiamRolleError({
                    code: 400,
                    i18nKey: RolleErrorI18nTypes.SERVICE_PROVIDER_NICHT_VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                });

                filter.catch(error, argumentsHost);

                expect(responseMock.status).toHaveBeenCalledWith(400);
                expect(responseMock.json).toHaveBeenCalledWith(expectedError);
            });
        });
    });
});
