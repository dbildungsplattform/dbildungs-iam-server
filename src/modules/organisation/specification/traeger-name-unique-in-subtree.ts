import { CompositeSpecification } from '../../specification/specifications.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { Organisation } from '../domain/organisation.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { OrganisationScope } from '../persistence/organisation.scope.js';

type RootChildren = Awaited<ReturnType<OrganisationRepository['findRootDirectChildren']>>;

export class TraegerNameUniqueInSubtree<
    WasPersisted extends boolean,
    RelationshipsLoaded extends boolean,
> extends CompositeSpecification<Organisation<WasPersisted, RelationshipsLoaded>> {
    private cachedRootChildren: RootChildren = [undefined, undefined];

    public constructor(private readonly organisationRepository: OrganisationRepository) {
        super();
    }

    public override async isSatisfiedBy(t: Organisation<WasPersisted, RelationshipsLoaded>): Promise<boolean> {
        if (t.typ !== OrganisationsTyp.TRAEGER) {
            return true;
        }
        if (!t.name) {
            return false;
        }
        this.cachedRootChildren = await this.organisationRepository.findRootDirectChildren();
        if (await this.isDuplicateOfRootNodes(t)) {
            return false;
        }
        return this.hasUniqueNameInSubtree(t);
    }

    private async isDuplicateOfRootNodes(t: Organisation<WasPersisted, RelationshipsLoaded>): Promise<boolean> {
        const rootOrganisation: Option<Organisation<true, false>> = await this.organisationRepository.findById(
            this.organisationRepository.ROOT_ORGANISATION_ID,
        );
        if (rootOrganisation && rootOrganisation.name === t.name) {
            return true;
        }
        const [oeffentlich, ersatz]: RootChildren = this.cachedRootChildren;
        if (oeffentlich && oeffentlich.name === t.name) {
            return true;
        }
        if (ersatz && ersatz.name === t.name) {
            return true;
        }
        return false;
    }

    private async hasUniqueNameInSubtree(t: Organisation<WasPersisted, RelationshipsLoaded>): Promise<boolean> {
        const scope: OrganisationScope = new OrganisationScope().findBy({
            name: t.name,
            typ: OrganisationsTyp.TRAEGER,
        });

        const [traegersWithSameName, count]: Counted<Organisation<true, false>> =
            await this.organisationRepository.findBy(scope);
        if (count === 0) {
            return true;
        }

        const siblings: Array<Organisation<true, false>> = traegersWithSameName.filter(
            (sibling: Organisation<true, false>) => sibling.id !== t.id,
        );
        if (siblings.length === 0) {
            return true;
        }

        const subtreeRoot: Organisation<true, false> | undefined = await this.findSubtreeRoot(t);

        if (!subtreeRoot) {
            return true;
        }

        const duplicateNameOnSameSubtree: Array<boolean> = await Promise.all(
            siblings.map((sibling: Organisation<true, false>) =>
                this.organisationRepository.isOrgaAParentOfOrgaB(subtreeRoot.id, sibling.id),
            ),
        );

        return !duplicateNameOnSameSubtree.some(Boolean);
    }

    private async findSubtreeRoot(
        t: Organisation<WasPersisted, RelationshipsLoaded>,
    ): Promise<Organisation<true, false> | undefined> {
        const [oeffentlich, ersatz]: RootChildren = this.cachedRootChildren;
        if (!t.zugehoerigZu) {
            return undefined;
        }
        // test for direct children first, maybe we can return early
        if (oeffentlich && t.zugehoerigZu === oeffentlich.id) {
            return oeffentlich;
        }
        if (ersatz && t.zugehoerigZu === ersatz.id) {
            return ersatz;
        }

        if (oeffentlich && (await this.organisationRepository.isOrgaAParentOfOrgaB(oeffentlich.id, t.zugehoerigZu))) {
            return oeffentlich;
        }
        if (ersatz && (await this.organisationRepository.isOrgaAParentOfOrgaB(ersatz.id, t.zugehoerigZu))) {
            return ersatz;
        }
        return undefined;
    }
}
