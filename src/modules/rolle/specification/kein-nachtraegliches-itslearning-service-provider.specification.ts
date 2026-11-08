import { xor } from 'lodash-es';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { type ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { type ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { CompositeSpecification } from '../../specification/specifications.js';
import { type Rolle } from '../domain/rolle.js';

// Unlike NurNachtraeglichZuweisbareServiceProvider, this rule does not depend on the NACHTRAEGLICH_ZUWEISBAR merkmal:
// itslearning access must always be granted through a Rollenerweiterung, never by changing an already assigned Rolle.
export class KeinNachtraeglichesItslearningServiceProvider extends CompositeSpecification<Rolle<boolean>> {
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
            return true;
        }

        const changedServiceProviders: Map<string, ServiceProvider<true>> = await this.serviceProviderRepo.findByIds(
            changedServiceProviderIds,
        );
        for (const changedServiceProvider of changedServiceProviders.values()) {
            if (changedServiceProvider.externalSystem === ServiceProviderSystem.ITSLEARNING) {
                return false;
            }
        }
        return true;
    }
}
