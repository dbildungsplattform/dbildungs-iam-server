import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { type ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { type Rollenerweiterung } from '../domain/rollenerweiterung.js';

export class ServiceProviderVerfuegbarFuerRollenerweiterung {
    public isSatisfiedBy(
        rollenerweiterung: Rollenerweiterung<boolean>,
        serviceProvider: ServiceProvider<true>,
    ): boolean {
        return (
            serviceProvider.id === rollenerweiterung.serviceProviderId &&
            serviceProvider.merkmale.includes(ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG)
        );
    }
}
