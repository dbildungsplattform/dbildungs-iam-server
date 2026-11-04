import { CompositeSpecification } from '../../../specification/specifications.js';
import { type Organisation, type Organisationsbeziehung } from '../../domain/organisation.js';
import { type OrganisationRepository } from '../../persistence/organisation.repository.js';
import { OrganisationsbeziehungsTyp } from '../../domain/organisationsbeziehungs-typ.enum.js';
import { OrganisationsTyp } from '../../domain/organisation.enums.js';

export class SchultraegerSchuleHatExaktEinenTraeger extends CompositeSpecification<Organisationsbeziehung<boolean>> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    public async isSatisfiedBy(beziehung: Organisationsbeziehung<boolean>): Promise<boolean> {
        if (beziehung.typ !== OrganisationsbeziehungsTyp.SCHULTRAEGER) {
            return true;
        }

        const schule: Option<Organisation<true, true>> = await this.organisationRepo.findByIdWithRelationships(
            beziehung.quellOrganisationId,
        );
        if (schule?.typ !== OrganisationsTyp.SCHULE) {
            return true;
        }

        // The given Organisationsbeziehung may already be persisted, so it must not be counted twice
        const schultraegerBeziehungen: Organisationsbeziehung<boolean>[] = [
            ...schule.organisationsbeziehungen.filter(
                (existing: Organisationsbeziehung<boolean>) =>
                    existing.typ === OrganisationsbeziehungsTyp.SCHULTRAEGER &&
                    !(beziehung.id && existing.id === beziehung.id),
            ),
            beziehung,
        ];

        const zielIds: string[] = schultraegerBeziehungen.map(
            (b: Organisationsbeziehung<boolean>) => b.zielOrganisationId,
        );
        const zielOrganisationen: Map<string, Organisation<true>> = await this.organisationRepo.findByIds(zielIds);

        const anzahlTraeger: number = schultraegerBeziehungen.filter(
            (b: Organisationsbeziehung<boolean>) =>
                zielOrganisationen.get(b.zielOrganisationId)?.typ === OrganisationsTyp.TRAEGER,
        ).length;

        return anzahlTraeger === 1;
    }
}
