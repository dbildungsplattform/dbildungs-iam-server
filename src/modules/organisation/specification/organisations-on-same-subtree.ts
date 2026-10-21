import { CompositeSpecification } from '../../specification/specifications.js';
import { type RootDirectChildrenType } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { type OrganisationRepository } from '../persistence/organisation.repository.js';

export class OrganisationsOnSameSubtree extends CompositeSpecification<Organisation<true, boolean>[]> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    public override async isSatisfiedBy(orgas: Organisation<true, boolean>[]): Promise<boolean> {
        return this.allSameZuordnung(orgas);
    }

    private async allSameZuordnung(orgas: Organisation<true, boolean>[]): Promise<boolean> {
        const zuordnungen: RootDirectChildrenType[] = await Promise.all(
            orgas.map((orga: Organisation<true, boolean>) =>
                this.organisationRepo.findOrganisationZuordnungErsatzOderOeffentlich(orga.id),
            ),
        );

        const firstZuordnung: RootDirectChildrenType | undefined = zuordnungen[0];

        return zuordnungen.every((t: RootDirectChildrenType) => t === firstZuordnung);
    }
}
