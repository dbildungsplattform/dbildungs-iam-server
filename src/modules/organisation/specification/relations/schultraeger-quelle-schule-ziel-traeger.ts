import { CompositeSpecification } from '../../../specification/specifications.js';
import { type OrganisationRepository } from '../../persistence/organisation.repository.js';
import { OrganisationsbeziehungsTyp } from '../../domain/organisationsbeziehungs-typ.enum.js';
import type { Organisation, Organisationsbeziehung } from '../../domain/organisation.js';
import { OrganisationsTyp } from '../../domain/organisation.enums.js';

export class SchultraegerQuelleSchuleZielTraeger extends CompositeSpecification<Organisationsbeziehung<boolean>> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    /**
     * Also returns false if type of OrganisationBeziehung does not match.
     * @param t
     */
    public async isSatisfiedBy(t: Organisationsbeziehung<boolean>): Promise<boolean> {
        if (t.typ !== OrganisationsbeziehungsTyp.SCHULTRAEGER) {
            return false;
        }

        const quellOrganisation: Option<Organisation<true>> = await this.organisationRepo.findById(
            t.quellOrganisationId,
        );
        if (quellOrganisation?.typ !== OrganisationsTyp.SCHULE) {
            return false;
        }

        const zielOrganisation: Option<Organisation<true>> = await this.organisationRepo.findById(t.zielOrganisationId);
        if (zielOrganisation?.typ !== OrganisationsTyp.TRAEGER) {
            return false;
        }

        return true;
    }
}
