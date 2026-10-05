import { CompositeSpecification } from '../../specification/specifications.js';

import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { Organisation } from '../domain/organisation.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { OrganisationScope } from '../persistence/organisation.scope.js';

export class SchuleKennungEindeutig extends CompositeSpecification<Organisation<boolean>> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    public async isSatisfiedBy(organisation: Organisation<boolean>): Promise<boolean> {
        if (organisation.typ !== OrganisationsTyp.SCHULE) {
            return true;
        }
        return this.validateSchuleKennungIsUnique(organisation);
    }

    private async validateSchuleKennungIsUnique(organisation: Organisation<boolean>): Promise<boolean> {
        const orgaScope: OrganisationScope = new OrganisationScope();
        orgaScope.findBy({
            kennung: organisation.kennung,
        });
        const [data]: Counted<Organisation<true>> = await this.organisationRepo.findBy(orgaScope);
        if (data.some((org: Organisation<true>) => org.id !== organisation.id)) {
            return false;
        } else {
            return true;
        }
    }
}
