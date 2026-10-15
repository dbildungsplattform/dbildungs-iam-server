import { type ServiceProvider } from '../domain/service-provider.js';
import { type ServiceProviderInternalRepo } from '../repo/service-provider.internal.repo.js';
import { CompositeSpecification } from '../../specification/specifications.js';

export class NameUniqueAtOrgaSpecification extends CompositeSpecification<ServiceProvider<boolean>> {
    public constructor(private readonly serviceProviderInternalRepo: ServiceProviderInternalRepo) {
        super();
    }

    public async isSatisfiedBy(serviceProvider: ServiceProvider<boolean>): Promise<boolean> {
        return !(await this.serviceProviderInternalRepo.existsDuplicateNameForOrganisation(
            serviceProvider.name,
            serviceProvider.providedOnSchulstrukturknoten,
            serviceProvider.id,
        ));
    }
}
