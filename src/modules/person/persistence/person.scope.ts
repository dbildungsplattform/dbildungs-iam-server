import { type EntityName, type FilterObject, type FilterQuery } from '@mikro-orm/core';
import { ScopeBase, ScopeOperator } from '../../../shared/persistence/index.js';
import { PersonEntity } from './person.entity.js';
import { type OrganisationID, type PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { type EntityManager, type SelectQueryBuilder } from '@mikro-orm/postgresql';

type FindProps = {
    ids?: PersonID[] | undefined[];
    vorname?: string;
    familienname?: string;
    organisationen?: OrganisationID[];
};

export class PersonScope extends ScopeBase<PersonEntity> {
    public override get entityName(): EntityName<PersonEntity> {
        return PersonEntity;
    }

    public findBy(findProps: Findable<FindProps>, operator: ScopeOperator = ScopeOperator.AND): this {
        const filters: FilterObject<PersonEntity> = {
            [operator]: [
                findProps.ids !== undefined && {
                    id: { $in: findProps.ids },
                },
                findProps.vorname !== undefined && { vorname: findProps.vorname },
                findProps.familienname !== undefined && { familienname: findProps.familienname },
                findProps.organisationen !== undefined && {
                    personenKontexte: { $some: { organisationId: { $in: findProps.organisationen } } },
                },
                { istTechnisch: false },
            ].filter(Boolean),
        };

        this.findByQuery(filters);

        return this;
    }

    // overriding implementation is necessary to populate emailAddresses for triggering events with email properties. e.g. when person is deleted
    public override async executeQuery(em: EntityManager): Promise<Counted<PersonEntity>> {
        const selectQuery: SelectQueryBuilder<PersonEntity> = this.getQueryBuilder(em);

        const [entities, count]: [PersonEntity[], number] = await selectQuery.getResultAndCount();
        await em.populate(entities, ['emailAddresses']);

        return [entities, count];
    }

    public findByPersonenKontext(organisationen?: string[], rollen?: string[]): this {
        const filters: FilterQuery<PersonEntity> = {
            personenKontexte: {
                ...(organisationen ? { organisationId: { $in: organisationen } } : {}),
                ...(rollen ? { rolleId: { $in: rollen } } : {}),
            },
        };
        this.findByQuery(filters);
        return this;
    }

    public findBySearchString(searchStr: string): this {
        this.findBySubstring(['vorname', 'familienname', 'username', 'personalnummer'], searchStr, ScopeOperator.OR);

        return this;
    }
}
