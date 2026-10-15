import { xor } from 'lodash-es';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { type ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { type ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { CompositeSpecification } from '../../specification/specifications.js';
import { type Rolle } from '../domain/rolle.js';

export class NurNachtraeglichZuweisbareServiceProvider extends CompositeSpecification<Rolle<boolean>> {
    public constructor(
        private readonly serviceProviderRepo: ServiceProviderRepo,
        private readonly oldRolle: Rolle<true>,
    ) {
        super();
    }

    public async isSatisfiedBy(updatedRolle: Rolle<boolean>): Promise<boolean> {
        const changedServiceProviderIds: string[] = xor(
            this.oldRolle.serviceProviderIds,
            updatedRolle.serviceProviderIds,
        );
        if (changedServiceProviderIds.length === 0) {
            return true; // No changes in service providers, so the specification is satisfied
        }

        const changedServiceProviders: Map<string, ServiceProvider<true>> = await this.serviceProviderRepo.findByIds(
            changedServiceProviderIds,
        );
        for (const changedServiceProvider of changedServiceProviders.values()) {
            if (!changedServiceProvider.merkmale.includes(ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR)) {
                return false;
            }
        }
        return true;
    }
}
