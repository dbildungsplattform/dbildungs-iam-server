import { AnyEntity, EntityName, QueryOrderMap, EntityKey, FilterObject } from '@mikro-orm/core';
import { EntityManager, QBFilterQuery, QueryBuilder, SelectQueryBuilder } from '@mikro-orm/postgresql';
import { ScopeOrder, ScopeOperator } from './scope.enums.js';
import { ScopeBaseNestedError } from './error/scope-base-nested.error.js';

export abstract class ScopeBase<T extends AnyEntity> {
    private readonly queryFilters: FilterObject<T>[] = [];

    private readonly queryOrderMaps: QueryOrderMap<T>[] = [];

    private scopeWhereOperator?: ScopeOperator;

    private offset: Option<number>;

    private limit: Option<number>;

    protected abstract get entityName(): EntityName<T>;

    public setScopeWhereOperator(operator: ScopeOperator): this {
        if (this.scopeWhereOperator) {
            throw new ScopeBaseNestedError();
        }
        this.scopeWhereOperator = operator;
        return this;
    }

    public async executeQuery(em: EntityManager): Promise<Counted<T>> {
        const selectQuery: SelectQueryBuilder<T> = this.getQueryBuilder(em);

        return selectQuery.getResultAndCount();
    }

    public getQueryBuilder(em: EntityManager): SelectQueryBuilder<T> {
        const qb: QueryBuilder<T> = em.createQueryBuilder(this.entityName);

        const scopeOperator: ScopeOperator = this.scopeWhereOperator ?? ScopeOperator.OR;
        const combinedFilters: QBFilterQuery<T> = {
            [scopeOperator]: this.queryFilters,
        } as QBFilterQuery<T>;

        const result: SelectQueryBuilder<T> = qb
            .select('*')
            .where(combinedFilters)
            .orderBy(this.queryOrderMaps)
            .offset(this.offset ?? undefined)
            .limit(this.limit ?? undefined);

        return result;
    }

    public sortBy(prop: EntityKey<T>, order: ScopeOrder): this {
        const queryOrderMap: QueryOrderMap<T> = { [prop]: order } as QueryOrderMap<T>;

        this.queryOrderMaps.push(queryOrderMap);

        return this;
    }

    public paged(offset: Option<number>, limit: Option<number>): this {
        this.offset = offset;
        this.limit = limit;

        return this;
    }

    protected findByInternal(props: Findable<T>, operator: ScopeOperator): this {
        const query: QBFilterQuery<T> = {
            [operator]: Object.keys(props)
                .filter((key: string) => props[key] !== undefined)
                .map((key: string) => ({
                    [key]: props[key],
                })),
        } as QBFilterQuery<T>;

        this.queryFilters.push(query);

        return this;
    }

    public findBySubstring(
        fields: EntityKey<T>[],
        substring: string,
        operator: ScopeOperator = ScopeOperator.OR,
    ): this {
        const likeConditions: QBFilterQuery<T>[] = fields.map((field: EntityKey<T>): QBFilterQuery<T> => {
            return { [field]: { $ilike: `%${substring}%` } } as QBFilterQuery<T>;
        });
        const query: QBFilterQuery<T> = { [operator]: likeConditions } as QBFilterQuery<T>;

        this.queryFilters.push(query);

        return this;
    }

    protected findByQuery(filter: FilterObject<T>): this {
        this.queryFilters.push(filter);

        return this;
    }
}
