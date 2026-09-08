import { DoFactory } from '../../../../test/utils/index.js';
import { ServiceProvider } from '../domain/service-provider.js';
import { ServiceProviderResponse } from './service-provider.response.js';

describe('ServiceProviderResponse', () => {
    describe('when provider has mime-type', () => {
        it('should set hasLogo to true', () => {
            const provider: ServiceProvider<true> = DoFactory.createServiceProvider(true);

            const response: ServiceProviderResponse = new ServiceProviderResponse(provider);

            expect(response.hasLogo).toBe(true);
            expect(response.rollenartenWhitelist).toEqual(provider.rollenartenWhitelist);
        });
    });

    describe('when provider has no logo mime-type', () => {
        it('should set hasLogo to false', () => {
            const provider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                logoMimeType: undefined,
            });

            const response: ServiceProviderResponse = new ServiceProviderResponse(provider);

            expect(response.hasLogo).toBe(false);
        });
    });
});
