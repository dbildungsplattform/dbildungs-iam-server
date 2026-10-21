import { CompositeSpecification } from '../../specification/specifications.js';
import type { Organisation } from '../domain/organisation.js';
import type { OrganisationRepository } from '../persistence/organisation.repository.js';

export class BehoerdeAdministriertVon extends CompositeSpecification<Organisation<boolean>> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    public async isSatisfiedBy(organisation: Organisation<boolean>): Promise<boolean> {
        if (!organisation.isBehoerde()) {
            return true;
        }
        if (!organisation.administriertVon) {
            return false;
        }
        const parent: Option<Organisation<true>> = await this.organisationRepo.findById(organisation.administriertVon);
        if (!parent) {
            return false;
        }

        return parent.isBehoerde() || parent.isLand();
    }
}
