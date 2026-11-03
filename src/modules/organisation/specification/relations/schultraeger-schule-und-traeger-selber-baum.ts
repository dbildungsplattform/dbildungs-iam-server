import { CompositeSpecification } from '../../../specification/specifications.js';
import { type Organisation, type Organisationsbeziehung } from '../../domain/organisation.js';
import { type OrganisationRepository } from '../../persistence/organisation.repository.js';
import { OrganisationsbeziehungsTyp } from '../../domain/organisationsbeziehungs-typ.enum.js';
import { OrganisationsTyp } from '../../domain/organisation.enums.js';
import { OrganisationsOnSameSubtree } from '../organisations-on-same-subtree.js';

export class SchultraegerSchuleUndTraegerSelberBaum extends CompositeSpecification<Organisationsbeziehung<boolean>> {
    private readonly sameSubtree: OrganisationsOnSameSubtree;

    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
        this.sameSubtree = new OrganisationsOnSameSubtree(organisationRepo);
    }

    public async isSatisfiedBy(beziehung: Organisationsbeziehung<boolean>): Promise<boolean> {
        if (beziehung.typ !== OrganisationsbeziehungsTyp.SCHULTRAEGER) {
            return true;
        }

        const schule: Option<Organisation<true>> = await this.organisationRepo.findById(beziehung.quellOrganisationId);
        if (!schule || schule.typ !== OrganisationsTyp.SCHULE) {
            return true;
        }

        // The specification SchultraegerSchuleHatExaktEinenTraeger checks that there is exactly one TRAEGER, not part of this specification
        const traeger: Option<Organisation<true>> = await this.organisationRepo.findById(beziehung.zielOrganisationId);
        if (!traeger || traeger.typ !== OrganisationsTyp.TRAEGER) {
            return true;
        }

        return this.sameSubtree.isSatisfiedBy([schule, traeger]);
    }
}
