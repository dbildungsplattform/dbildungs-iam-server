import { CompositeSpecification } from '../../../specification/specifications.js';
import { type OrganisationRepository } from '../../persistence/organisation.repository.js';
import { OrganisationsTyp } from '../../domain/organisation.enums.js';
import { OrganisationsbeziehungsTyp } from '../../domain/organisationsbeziehungs-typ.enum.js';
import { type Organisation, type Organisationsbeziehung } from '../../domain/organisation.js';

export class SchulaufsichtQuelleSchuleZielBehoerde extends CompositeSpecification<Organisationsbeziehung<boolean>> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    public async isSatisfiedBy(t: Organisationsbeziehung<boolean>): Promise<boolean> {
        if (t.typ !== OrganisationsbeziehungsTyp.SCHULAUFSICHT) {
            return true;
        }

        const quellOrganisation: Option<Organisation<true>> = await this.organisationRepo.findById(
            t.quellOrganisationId,
        );
        if (!quellOrganisation || quellOrganisation.typ !== OrganisationsTyp.SCHULE) {
            return false;
        }

        const zielOrganisation: Option<Organisation<true>> = await this.organisationRepo.findById(t.zielOrganisationId);
        if (!zielOrganisation || zielOrganisation.typ !== OrganisationsTyp.BEHOERDE) {
            return false;
        }

        return true;
    }
}
