import { CompositeSpecification } from '../../specification/specifications.js';

import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { type OrganisationRepository } from '../persistence/organisation.repository.js';

export class KlassenNameAnSchuleEindeutig extends CompositeSpecification<Organisation<boolean>> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    public async isSatisfiedBy(t: Organisation<boolean>): Promise<boolean> {
        if (t.typ !== OrganisationsTyp.KLASSE) {
            return true;
        }
        return this.validateClassNameIsUniqueOnSchool(t);
    }

    private async validateClassNameIsUniqueOnSchool(t: Organisation<boolean>): Promise<boolean> {
        if (!t.administriertVon) {
            return false;
        }
        const parent: Option<Organisation<true>> = await this.organisationRepo.findById(t.administriertVon);
        if (!parent) {
            return false;
        }
        //check that parent is of type SCHULE is done in a different specification
        const otherChildOrgas: Organisation<true>[] = await this.organisationRepo.findChildOrgasForIds([parent.id]);
        for (const otherChildOrga of otherChildOrgas) {
            if (otherChildOrga.typ === OrganisationsTyp.KLASSE) {
                if (otherChildOrga.name === t.name) {
                    return false;
                } //not satisfied if another Klasse already has same name
            }
        }
        return true;
    }
}
