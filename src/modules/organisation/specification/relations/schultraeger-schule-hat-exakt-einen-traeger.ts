import { CompositeSpecification } from '../../../specification/specifications.js';
import { type Organisation, type Organisationsbeziehung } from '../../domain/organisation.js';
import { type OrganisationRepository } from '../../persistence/organisation.repository.js';
import { OrganisationsbeziehungsTyp } from '../../domain/organisationsbeziehungs-typ.enum.js';
import { OrganisationsTyp } from '../../domain/organisation.enums.js';

export class SchultraegerSchuleHatExaktEinenTraeger extends CompositeSpecification<Organisation<true, true>> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    public async isSatisfiedBy(t: Organisation<true, true>): Promise<boolean> {
        if (t.typ !== OrganisationsTyp.SCHULE) {
            return false;
        }

        const schultraegerBeziehungen: Organisationsbeziehung<boolean>[] = t.organisationsbeziehungen.filter(
            (beziehung: Organisationsbeziehung<boolean>) => beziehung.typ === OrganisationsbeziehungsTyp.SCHULTRAEGER,
        );

        const zielIds: string[] = schultraegerBeziehungen.map(
            (beziehung: Organisationsbeziehung<boolean>) => beziehung.zielOrganisationId,
        );
        const zielOrganisationen: Map<string, Organisation<true>> = await this.organisationRepo.findByIds(zielIds);

        const anzahlTraeger: number = schultraegerBeziehungen.filter(
            (beziehung: Organisationsbeziehung<boolean>) =>
                zielOrganisationen.get(beziehung.zielOrganisationId)?.typ === OrganisationsTyp.TRAEGER,
        ).length;

        return anzahlTraeger === 1;
    }
}
