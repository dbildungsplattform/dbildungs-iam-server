import { DoFactory } from '../../../../test/utils/index.js';
import { ServiceProviderResponse } from './service-provider.response.js';
import { CreateServiceProviderResponse } from './create-service-provider.response.js';
import { ServiceProvider } from '../domain/service-provider.js';

describe('CreateServiceProviderResponse', () => {
    it('should inherit directly from ServiceProviderResponse', () => {
        expect(Object.getPrototypeOf(CreateServiceProviderResponse.prototype)).toBe(ServiceProviderResponse.prototype);
    });

    it('should copy the base response fields and keep url', () => {
        const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);

        const response: CreateServiceProviderResponse = new CreateServiceProviderResponse(serviceProvider);

        expect(response.id).toBe(serviceProvider.id);
        expect(response.name).toBe(serviceProvider.name);
        expect(response.target).toBe(serviceProvider.target);
        expect(response.url).toBe(serviceProvider.url);
        expect(response.hasLogo).toBe(true);
        expect(response.rollenartenWhitelist).toEqual(serviceProvider.rollenartenWhitelist);
    });
});
