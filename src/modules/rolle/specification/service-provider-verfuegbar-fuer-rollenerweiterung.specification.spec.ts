import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { type ServiceProvider } from '../../service-provider/domain/service-provider.js';
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
            [false, 'not available', DoFactory.createServiceProvider(true, { merkmale: [] })],
            [false, 'undefined', undefined],
        ])(
            'should return %s if the service provider is %s',
            async (expected: boolean, _label: string, sp: Option<ServiceProvider<boolean>>) => {
                const rollenerweiterungMock: DeepMocked<Rollenerweiterung<boolean>> = createMock(
                    Rollenerweiterung<boolean>,
                );
                rollenerweiterungMock.getServiceProvider.mockResolvedValue(sp);

                const specification: ServiceProviderVerfuegbarFuerRollenerweiterung =
                    new ServiceProviderVerfuegbarFuerRollenerweiterung();
                await expect(specification.isSatisfiedBy(rollenerweiterungMock)).resolves.toBe(expected);
            },
        );
    });
});
