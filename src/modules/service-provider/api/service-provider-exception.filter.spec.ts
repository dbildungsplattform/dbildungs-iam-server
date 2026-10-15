import { type ArgumentsHost } from '@nestjs/common';
import { type Response } from 'express';
import { type MockedObject } from 'vitest';
import { createArgumentsHostMock, createResponseMock } from '../../../../test/utils/http.mocks.js';
import { ServiceProviderError } from '../specification/error/service-provider.error.js';
import { VidisServiceProviderImmutableError } from '../domain/errors/vidis-service-provider-immutable.error.js';
import { ServiceProviderErrorFilter } from './service-provider-exception.filter.js';
import { DbiamServiceProviderError, ServiceProviderErrorI18nTypes } from './dbiam-service-provider.error.js';

describe('ServiceProviderErrorFilter', () => {
    const sut: ServiceProviderErrorFilter = new ServiceProviderErrorFilter();

    const statusCode: number = 500;
    const generalBadRequestError: DbiamServiceProviderError = new DbiamServiceProviderError({
        code: 500,
        i18nKey: ServiceProviderErrorI18nTypes.SERVICE_PROVIDER_ERROR,
    });
    const vidisImmutableError: DbiamServiceProviderError = new DbiamServiceProviderError({
        code: 400,
        i18nKey: ServiceProviderErrorI18nTypes.VIDIS_SERVICE_PROVIDER_IMMUTABLE,
    });

    describe('catch', () => {
        it('should throw a general PersonError', () => {
            const error: ServiceProviderError = new ServiceProviderError(
                'error',
                ServiceProviderErrorI18nTypes.SERVICE_PROVIDER_ERROR,
            );

            const responseMock: MockedObject<Response> = createResponseMock();
            const argumentsHost: MockedObject<ArgumentsHost> = createArgumentsHostMock({ response: responseMock });

            sut.catch(error, argumentsHost);

            expect(responseMock.json).toHaveBeenCalled();
            expect(responseMock.status).toHaveBeenCalledWith(statusCode);
            expect(responseMock.json).toHaveBeenCalledWith(generalBadRequestError);
        });

        it('should map VIDIS-linked service-provider errors to bad request', () => {
            const error: ServiceProviderError = new VidisServiceProviderImmutableError('error');

            const responseMock: MockedObject<Response> = createResponseMock();
            const argumentsHost: MockedObject<ArgumentsHost> = createArgumentsHostMock({ response: responseMock });

            sut.catch(error, argumentsHost);

            expect(responseMock.status).toHaveBeenCalledWith(400);
            expect(responseMock.json).toHaveBeenCalledWith(vidisImmutableError);
        });
    });
});
