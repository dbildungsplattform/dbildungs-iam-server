import { CompositeSpecification } from '../../../specification/specifications.js';
import { type Organisation } from '../../domain/organisation.js';
import { type OrganisationRepository } from '../../persistence/organisation.repository.js';
import { OrganisationsTyp } from '../../domain/organisation.enums.js';
import { type OrganisationsbeziehungEntity } from '../../persistence/organisationsbeziehung.entity.js';
import { OrganisationsbeziehungsTyp } from '../../domain/organisationsbeziehungs-typ.enum.js';

export class SchulaufsichtQuelleSchuleZielBehoerde extends CompositeSpecification<OrganisationsbeziehungEntity> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    public async isSatisfiedBy(t: OrganisationsbeziehungEntity): Promise<boolean> {
        if (t.typ !== OrganisationsbeziehungsTyp.SCHULAUFSICHT) {
            return false;
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
