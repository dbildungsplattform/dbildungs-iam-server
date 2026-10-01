import { describe, expect, it } from 'vitest';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { Rollenerweiterung } from '../domain/rollenerweiterung.js';
import { ServiceProviderVerfuegbarFuerRollenerweiterung } from './service-provider-verfuegbar-fuer-rollenerweiterung.specification.js';

describe('ServiceProviderVerfuegbarFuerRollenerweiterung', () => {
    describe('isSatisfiedBy', () => {
        it.each([
            [
                true,
                'available',
                DoFactory.createServiceProvider(true, {
                    merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                }),
            ],
            [
                false,
                'not available',
                DoFactory.createServiceProvider(true, {
                    merkmale: [],
                }),
            ],
        ])(
            'should return %s if the service provider is %s',
            (expected: boolean, _label: string, serviceProvider: ServiceProvider<true>) => {
                const rollenerweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung<true>(true, {
                    serviceProviderId: serviceProvider.id,
                });

                const specification: ServiceProviderVerfuegbarFuerRollenerweiterung =
                    new ServiceProviderVerfuegbarFuerRollenerweiterung();

                expect(specification.isSatisfiedBy(rollenerweiterung, serviceProvider)).toBe(expected);
            },
        );

        it('should return false if the passed service provider does not belong to the Rollenerweiterung', () => {
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });

            const rollenerweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung<true>(true);

            const specification: ServiceProviderVerfuegbarFuerRollenerweiterung =
                new ServiceProviderVerfuegbarFuerRollenerweiterung();

            expect(specification.isSatisfiedBy(rollenerweiterung, serviceProvider)).toBe(false);
        });
    });
});
