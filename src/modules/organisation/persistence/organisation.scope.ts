import { type EntityName } from '@mikro-orm/core';
import { ScopeBase, ScopeOperator } from '../../../shared/persistence/index.js';
import { OrganisationEntity } from './organisation.entity.js';
import { type OrganisationsTyp } from '../domain/organisation.enums.js';

export type OrganisationFindByProps = {
    kennung?: string;
    name?: string;
    typ?: OrganisationsTyp;
};

export class OrganisationScope extends ScopeBase<OrganisationEntity> {
    protected override get entityName(): EntityName<OrganisationEntity> {
        return OrganisationEntity;
    }

    public findBy(findProps: Findable<OrganisationFindByProps>, operator: ScopeOperator = ScopeOperator.AND): this {
        this.findByInternal(
            {
                kennung: findProps.kennung,
                name: findProps.name,
                typ: findProps.typ,
            },
            operator,
        );

        return this;
    }

    public excludeTyp(types?: OrganisationsTyp[]): this {
        if (types) {
            this.findByQuery({
                typ: { $nin: types },
            });
        }

        return this;
    }

    public searchString(searchString: string | undefined): this {
        if (searchString) {
            this.findBySubstring(['name', 'kennung'], searchString, ScopeOperator.OR);
        }
        return this;
    }

    public searchStringAdministriertVon(searchString: string | undefined): this {
        if (searchString) {
            this.findBySubstring(['name'], searchString);
        }
        return this;
    }

    public findAdministrierteVon(parentOrganisationId: string): this {
        this.findByInternal(
            {
                administriertVon: parentOrganisationId,
            },
            ScopeOperator.AND,
        );

        return this;
    }

    public findZugehoerigeZu(parentOrganisationId: string): this {
        this.findByInternal(
            {
                zugehoerigZu: parentOrganisationId,
            },
            ScopeOperator.AND,
        );

        return this;
    }

    public filterByIds(orgaIds: string[]): this {
        if (orgaIds && orgaIds.length > 0) {
            this.findByQuery({
                id: { $in: orgaIds },
            });
        }
        return this;
    }
}
