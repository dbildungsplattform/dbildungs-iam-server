import { CompositeSpecification } from '../../specification/specifications.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { type OrganisationRepository } from '../persistence/organisation.repository.js';

export class TraegerUnterRootChild<
    WasPersisted extends boolean,
    RelationshipsLoaded extends boolean,
> extends CompositeSpecification<Organisation<WasPersisted, RelationshipsLoaded>> {
    public constructor(private readonly organisationRepository: OrganisationRepository) {
        super();
    }

    public override async isSatisfiedBy(t: Organisation<WasPersisted, RelationshipsLoaded>): Promise<boolean> {
        if (t.typ !== OrganisationsTyp.TRAEGER) {
            return true;
        }

        return this.isRootChild(t);
    }

    private async isRootChild(t: Organisation<WasPersisted, RelationshipsLoaded>): Promise<boolean> {
        const rootChildOrgas: Array<Organisation<true, false> | undefined> =
            await this.organisationRepository.findRootDirectChildren();

        return rootChildOrgas.some((parent: Organisation<true, false> | undefined) => parent?.id === t.zugehoerigZu);
    }
}
