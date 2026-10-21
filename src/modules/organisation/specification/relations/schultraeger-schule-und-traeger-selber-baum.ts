import { CompositeSpecification } from '../../../specification/specifications.js';
import { type Organisation, type Organisationsbeziehung } from '../../domain/organisation.js';
import { type OrganisationRepository } from '../../persistence/organisation.repository.js';
import { OrganisationsbeziehungsTyp } from '../../domain/organisationsbeziehungs-typ.enum.js';
import { OrganisationsTyp } from '../../domain/organisation.enums.js';
import { OrganisationsOnSameSubtree } from '../organisations-on-same-subtree.js';

export class SchultraegerSchuleUndTraegerSelberBaum extends CompositeSpecification<Organisation<true, true>> {
    private readonly sameSubtree: OrganisationsOnSameSubtree;

    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
        this.sameSubtree = new OrganisationsOnSameSubtree(organisationRepo);
    }

    public async isSatisfiedBy(schule: Organisation<true, true>): Promise<boolean> {
        if (schule.typ !== OrganisationsTyp.SCHULE) {
            return true;
        }

        const zielIds: string[] = schule.organisationsbeziehungen
            .filter(
                (beziehung: Organisationsbeziehung<boolean>) =>
                    beziehung.typ === OrganisationsbeziehungsTyp.SCHULTRAEGER,
            )
            .map((beziehung: Organisationsbeziehung<boolean>) => beziehung.zielOrganisationId);
        const ziele: Map<string, Organisation<true>> = await this.organisationRepo.findByIds(zielIds);
        // SchultraegerSchuleHatExaktEinenTraeger checks that there is exactly one TRAEGER, not part of this specification
        const traeger: Organisation<true>[] = [...ziele.values()].filter(
            (orga: Organisation<true>) => orga.typ === OrganisationsTyp.TRAEGER,
        );

        return this.sameSubtree.isSatisfiedBy([schule, ...traeger]);
    }
}
