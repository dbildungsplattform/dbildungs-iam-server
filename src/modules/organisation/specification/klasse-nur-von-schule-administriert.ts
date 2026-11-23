import { CompositeSpecification } from '../../specification/specifications.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { type OrganisationRepository } from '../persistence/organisation.repository.js';

export class KlasseNurVonSchuleAdministriert extends CompositeSpecification<Organisation<boolean>> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    public async isSatisfiedBy(t: Organisation<boolean>): Promise<boolean> {
        if (t.typ !== OrganisationsTyp.KLASSE) {
            return true;
        }
        return this.validateAdministriertVon(t);
    }

    private async validateAdministriertVon(t: Organisation<boolean>): Promise<boolean> {
        if (!t.administriertVon) {
            return false;
        }
        const parent: Option<Organisation<true>> = await this.organisationRepo.findById(t.administriertVon);
        if (!parent) {
            return false;
        }
        return parent.typ === OrganisationsTyp.SCHULE;
    }
}
