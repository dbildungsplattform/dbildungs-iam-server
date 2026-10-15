import { CompositeSpecification } from '../../specification/specifications.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { type OrganisationRepository } from '../persistence/organisation.repository.js';

export class TraegerUnterRootChild<Persisted extends boolean> extends CompositeSpecification<Organisation<Persisted>> {
    public constructor(private readonly organisationRepository: OrganisationRepository) {
        super();
    }

    public override async isSatisfiedBy(t: Organisation<Persisted>): Promise<boolean> {
        if (t.typ !== OrganisationsTyp.TRAEGER) {
            return true;
        }
        const isRootChild: boolean = await this.isRootChild(t);
        return isRootChild;
    }

    private async isRootChild(t: Organisation<Persisted>): Promise<boolean> {
        const rootChildOrgas: Array<Organisation<true> | undefined> =
            await this.organisationRepository.findRootDirectChildren();
        return rootChildOrgas.some((parent: Organisation<true> | undefined) => parent?.id === t.zugehoerigZu);
    }
}
