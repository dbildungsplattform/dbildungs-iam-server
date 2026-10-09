import { CompositeSpecification } from '../../specification/specifications.js';

import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { Organisation } from '../domain/organisation.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { OrganisationScope } from '../persistence/organisation.scope.js';

export class BehoerdeNameUnique extends CompositeSpecification<Organisation<boolean>> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    public async isSatisfiedBy(organisation: Organisation<boolean>): Promise<boolean> {
        if (!organisation.isBehoerde()) {
            return true;
        }

        return this.validateBehoerdeNameIsUnique(organisation);
    }

    private async validateBehoerdeNameIsUnique(organisation: Organisation<boolean>): Promise<boolean> {
        const orgaScope: OrganisationScope = new OrganisationScope();
        orgaScope.findBy({
            name: organisation.name,
            typ: OrganisationsTyp.BEHOERDE,
        });
        const [data]: Counted<Organisation<true>> = await this.organisationRepo.findBy(orgaScope);
        return !data.some((org: Organisation<true>) => org.id !== organisation.id);
    }
}
