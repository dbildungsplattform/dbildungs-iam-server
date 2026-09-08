import {
    EntityDictionary,
    EntityManager,
    FilterQuery,
    Loaded,
    QueryBuilder,
    RawQueryFragment,
    RequiredEntityData,
    sql,
} from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DataConfig, ServerConfig } from '../../../shared/config/index.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityCouldNotBeUpdated } from '../../../shared/error/entity-could-not-be-updated.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { KafkaKlasseCreatedEvent } from '../../../shared/events/kafka-klasse-created.event.js';
import { KafkaKlasseUpdatedEvent } from '../../../shared/events/kafka-klasse-updated.event.js';
import { KafkaOrganisationDeletedEvent } from '../../../shared/events/kafka-organisation-deleted.event.js';
import { KafkaSchuleCreatedEvent } from '../../../shared/events/kafka-schule-created.event.js';
import { KafkaSchuleItslearningEnabledEvent } from '../../../shared/events/kafka-schule-itslearning-enabled.event.js';
import { KlasseCreatedEvent } from '../../../shared/events/klasse-created.event.js';
import { KlasseUpdatedEvent } from '../../../shared/events/klasse-updated.event.js';
import { OrganisationDeletedEvent } from '../../../shared/events/organisation-deleted.event.js';
import { SchuleCreatedEvent } from '../../../shared/events/schule-created.event.js';
import { SchuleItslearningEnabledEvent } from '../../../shared/events/schule-itslearning-enabled.event.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { ScopeOperator, ScopeOrder } from '../../../shared/persistence/scope.enums.js';
import { OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { PermittedOrgas } from '../../authentication/domain/person-permissions.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { OrganisationUpdateOutdatedError } from '../domain/orga-update-outdated.error.js';
import { OrganisationsTyp, RootDirectChildrenType, SortFieldOrganisation } from '../domain/organisation.enums.js';
import { Organisation } from '../domain/organisation.js';
import { OrganisationSpecificationError } from '../specification/error/organisation-specification.error.js';
import { OrganisationEntity } from './organisation.entity.js';
import { OrganisationScope } from './organisation.scope.js';

export function mapOrgaAggregateToData(organisation: Organisation<boolean>): RequiredEntityData<OrganisationEntity> {
    return {
        id: organisation.id,
        administriertVon: organisation.administriertVon,
        zugehoerigZu: organisation.zugehoerigZu,
        kennung: organisation.kennung,
        name: organisation.name,
        namensergaenzung: organisation.namensergaenzung,
        kuerzel: organisation.kuerzel,
        typ: organisation.typ,
        traegerschaft: organisation.traegerschaft,
        emailDomain: organisation.emailDomain,
        emailAddress: organisation.emailAdress,
        itslearningEnabled: organisation.itslearningEnabled,
    };
}

export function mapOrgaEntityToAggregate(entity: OrganisationEntity): Organisation<true> {
    return Organisation.construct(
        entity.id,
        entity.createdAt,
        entity.updatedAt,
        entity.version,
        entity.administriertVon,
        entity.zugehoerigZu,
        entity.kennung,
        entity.name,
        entity.namensergaenzung,
        entity.kuerzel,
        entity.typ,
        entity.traegerschaft,
        entity.emailDomain,
        entity.emailAddress,
        entity.itslearningEnabled,
    );
}

export type OrganisationSearchOptions = {
    readonly kennung?: string;
    readonly name?: string;
    readonly searchString?: string;
    readonly typ?: OrganisationsTyp;
    readonly excludeTyp?: OrganisationsTyp[];
    readonly administriertVon?: string[];
    readonly organisationIds?: string[];
    readonly zugehoerigZu?: string[];
    readonly offset?: number;
    readonly limit?: number;
    readonly sortField?: SortFieldOrganisation;
    readonly sortOrder?: ScopeOrder;
    readonly getChildrenRecursively?: boolean;
    readonly matchAllSystemrechte?: boolean;
};

@Injectable()
export class OrganisationRepository {
    public readonly ROOT_ORGANISATION_ID: string;

    public constructor(
        private readonly logger: ClassLogger,
        private readonly eventService: EventRoutingLegacyKafkaService,
        private readonly em: EntityManager,
        config: ConfigService<ServerConfig>,
    ) {
        this.ROOT_ORGANISATION_ID = config.getOrThrow<DataConfig>('DATA').ROOT_ORGANISATION_ID;
    }

    public async findBy(scope: OrganisationScope): Promise<Counted<Organisation<true>>> {
        const [entities, total]: Counted<OrganisationEntity> = await scope.executeQuery(this.em);
        const organisations: Organisation<true>[] = entities.map((entity: OrganisationEntity) =>
            mapOrgaEntityToAggregate(entity),
        );
        return [organisations, total];
    }

    public async save(organisation: Organisation<boolean>): Promise<Organisation<true>> {
        if (organisation.id) {
            return this.update(organisation);
        } else {
            return this.create(organisation);
        }
    }

    public async exists(id: OrganisationID): Promise<boolean> {
        const organisation: Option<Loaded<OrganisationEntity, never, 'id', never>> = await this.em.findOne(
            OrganisationEntity,
            { id },
            { fields: ['id'] as const },
        );

        return !!organisation;
    }

    public async findChildOrgasForIds(ids: OrganisationID[]): Promise<Organisation<true>[]> {
        let rawResult: OrganisationEntity[];

        if (ids.length === 0) {
            return [];
        } else if (ids.some((id: OrganisationID) => id === this.ROOT_ORGANISATION_ID)) {
            // If id is the root, perform a simple SELECT * except root for performance enhancement.
            rawResult = await this.em.find(OrganisationEntity, { id: { $ne: this.ROOT_ORGANISATION_ID } });
        } else {
            // Otherwise, perform the recursive CTE query.
            const query: string = `
                WITH RECURSIVE sub_organisations AS (SELECT *
                                                     FROM public.organisation
                                                     WHERE administriert_von IN (?)
                                                     UNION ALL
                                                     SELECT o.*
                                                     FROM public.organisation o
                                                              INNER JOIN sub_organisations so ON o.administriert_von = so.id)
                SELECT DISTINCT ON (id) *
                FROM sub_organisations;
            `;

            const rawEntities: EntityDictionary<OrganisationEntity>[] = await this.em.execute(query, [ids]);
            rawResult = rawEntities.map((data: EntityDictionary<OrganisationEntity>) =>
                this.em.map(OrganisationEntity, data),
            );
        }

        return rawResult.map(mapOrgaEntityToAggregate);
    }

    public async findParentOrgasForIds(ids: OrganisationID[]): Promise<Organisation<true>[]> {
        let rawResult: OrganisationEntity[];

        if (ids.length === 0) {
            return [];
        } else {
            const query: string = `
                WITH RECURSIVE parent_organisations AS (
                    SELECT *
                    FROM public.organisation
                    WHERE id IN (?)
                    UNION ALL
                    SELECT o.*
                    FROM public.organisation o
                    INNER JOIN parent_organisations po ON po.administriert_von = o.id
                )
                SELECT DISTINCT ON (id) *
                FROM parent_organisations;
            `;

            const rawEntities: EntityDictionary<OrganisationEntity>[] = await this.em.execute(query, [ids]);
            rawResult = rawEntities.map((data: EntityDictionary<OrganisationEntity>) =>
                this.em.map(OrganisationEntity, data),
            );
        }

        return rawResult.map(mapOrgaEntityToAggregate);
    }

    /**
     * Searches for all upper level organisations for a given organisation by its organisationID
     * and returns an array sorted by the depth ascending. Element at index 0 is always the organisationIDs organisation,
     * this way the lowest child is always included. Its direct parent will be at index 1 and so on.
     */
    public async findParentOrgasForIdSortedByDepthAsc(id: OrganisationID): Promise<Organisation<true>[]> {
        const query: string = `
             WITH RECURSIVE parent_organisations AS (
                SELECT *, 0 as depth
                FROM public.organisation
                WHERE id = (?)
                UNION ALL
                SELECT o.*, depth + 1
                FROM public.organisation o
                INNER JOIN parent_organisations po ON po.administriert_von = o.id
            )
            SELECT *
            FROM parent_organisations ORDER BY depth;
        `;

        const rawResult: EntityDictionary<OrganisationEntity>[] = await this.em.execute(query, [id]);

        const res: Organisation<true>[] = rawResult
            .map((data: EntityDictionary<OrganisationEntity>) => this.em.map(OrganisationEntity, data))
            .map(mapOrgaEntityToAggregate);

        return res;
    }

    /**
     * Uses findParentOrgasForIdSortedByDepthAsc method to search for the first occurrence of an email-domain in the tree of organisations starting from passed organisationId.
     * @param id start of search (leaf)
     * @return first found email-domain or undefined if no email-domain could be found while walking the tree upwards
     */
    public async findEmailDomainForOrganisation(id: OrganisationID): Promise<string | undefined> {
        const organisations: Organisation<true>[] = await this.findParentOrgasForIdSortedByDepthAsc(id);
        const emailDomain: Option<string> = this.getDomainRecursive(organisations);

        return emailDomain ?? undefined;
    }

    private getDomainRecursive(organisationsSortedByDepthAsc: Organisation<true>[]): Option<string> {
        if (!organisationsSortedByDepthAsc || organisationsSortedByDepthAsc.length === 0) {
            return undefined;
        }
        if (organisationsSortedByDepthAsc[0] && organisationsSortedByDepthAsc[0].emailDomain) {
            return organisationsSortedByDepthAsc[0].emailDomain;
        }

        return this.getDomainRecursive(organisationsSortedByDepthAsc.slice(1));
    }

    public async isOrgaAParentOfOrgaB(
        organisationIdA: OrganisationID,
        organisationIdB: OrganisationID,
    ): Promise<boolean> {
        const query: string = `
            WITH RECURSIVE parent_organisations AS (SELECT id, administriert_von
                                                    FROM public.organisation
                                                    WHERE id = ?
                                                    UNION ALL
                                                    SELECT o.id, o.administriert_von
                                                    FROM public.organisation o
                                                             INNER JOIN parent_organisations po ON o.id = po.administriert_von)
            SELECT EXISTS (SELECT 1
                           FROM parent_organisations
                           WHERE id = ?) AS is_parent;
        `;

        const result: [{ is_parent: boolean }] = await this.em.execute(query, [organisationIdB, organisationIdA]);
        return result[0].is_parent;
    }

    public async findRootDirectChildren(): Promise<
        [oeffentlich: Organisation<true> | undefined, ersatz: Organisation<true> | undefined]
    > {
        const scope: OrganisationScope = new OrganisationScope().findAdministrierteVon(this.ROOT_ORGANISATION_ID);

        const [entities]: Counted<OrganisationEntity> = await scope.executeQuery(this.em);

        const oeffentlich: OrganisationEntity | undefined = entities.find((entity: OrganisationEntity) =>
            entity.name?.includes('Öffentliche'),
        );

        const ersatz: OrganisationEntity | undefined = entities.find((entity: OrganisationEntity) =>
            entity.name?.includes('Ersatz'),
        );

        return [oeffentlich && mapOrgaEntityToAggregate(oeffentlich), ersatz && mapOrgaEntityToAggregate(ersatz)];
    }

    public async findById(id: string): Promise<Option<Organisation<true>>> {
        const organisation: Option<OrganisationEntity> = await this.em.findOne(OrganisationEntity, { id });
        if (organisation) {
            return mapOrgaEntityToAggregate(organisation);
        }
        return null;
    }

    public async findByIds(ids: string[]): Promise<Map<string, Organisation<true>>> {
        const organisationEntities: OrganisationEntity[] = await this.em.find(OrganisationEntity, { id: { $in: ids } });

        const organisationMap: Map<string, Organisation<true>> = new Map();
        organisationEntities.forEach((organisationEntity: OrganisationEntity) => {
            const organisation: Organisation<true> = mapOrgaEntityToAggregate(organisationEntity);
            organisationMap.set(organisationEntity.id, organisation);
        });

        return organisationMap;
    }

    public async findByNameOrKennungAndExcludeByOrganisationType(
        excludeOrganisationType: OrganisationsTyp,
        searchStr?: string,
        permittedOrgaIds?: string[],
        limit?: number,
    ): Promise<Organisation<true>[]> {
        const scope: OrganisationScope = new OrganisationScope();

        // Set up the query with the search string, limit, and excluded type
        scope
            .searchString(searchStr)
            .setScopeWhereOperator(ScopeOperator.AND)
            .paged(0, limit)
            .excludeTyp([excludeOrganisationType]);

        // If permitted organization IDs are provided, add them to the query scope
        if (permittedOrgaIds && permittedOrgaIds.length > 0) {
            scope.filterByIds(permittedOrgaIds);
        }

        // Execute the query and return the result
        let foundOrganisations: Organisation<true>[] = [];
        [foundOrganisations] = await this.findBy(scope);

        return foundOrganisations;
    }

    public async findByNameOrKennung(searchStr: string): Promise<Organisation<true>[]> {
        const organisations: OrganisationEntity[] = await this.em.find(OrganisationEntity, {
            $or: [{ name: { $ilike: '%' + searchStr + '%' } }, { kennung: { $ilike: '%' + searchStr + '%' } }],
        });

        return organisations.map(mapOrgaEntityToAggregate);
    }

    public async findAuthorized(
        personPermissions: IPersonPermissions,
        systemrechte: RollenSystemRecht[],
        searchOptions: OrganisationSearchOptions,
    ): Promise<[Organisation<true>[], total: number, pageTotal: number]> {
        const permittedOrgas: PermittedOrgas = await personPermissions.getOrgIdsWithSystemrecht(
            systemrechte,
            true,
            searchOptions.matchAllSystemrechte,
        );
        if (!permittedOrgas.all && permittedOrgas.orgaIds.length === 0) {
            return [[], 0, 0];
        }

        let entitiesForIds: OrganisationEntity[] = [];

        // Extract sort logic to variables
        const sortBy: SortFieldOrganisation = searchOptions.sortField || SortFieldOrganisation.KENNUNG;
        const secondSortBy: SortFieldOrganisation =
            sortBy === SortFieldOrganisation.KENNUNG ? SortFieldOrganisation.NAME : SortFieldOrganisation.KENNUNG;
        const sortOrder: ScopeOrder = searchOptions.sortOrder || ScopeOrder.ASC;
        const orderDirection: 'ASC' | 'DESC' = sortOrder === ScopeOrder.ASC ? 'ASC' : 'DESC';

        // Create custom ORDER BY using sql helper
        const typeOrderClause: RawQueryFragment = sql`CASE WHEN typ = 'ROOT' then 1 WHEN typ = 'LAND' THEN 2 WHEN typ = 'TRAEGER' THEN 3 ELSE 4 END`;
        const sortByField: RawQueryFragment = sql.ref(sortBy);
        const secondSortByField: RawQueryFragment = sql.ref(secondSortBy);

        if (searchOptions.organisationIds && searchOptions.organisationIds.length > 0) {
            const organisationIds: string[] = permittedOrgas.all
                ? searchOptions.organisationIds
                : searchOptions.organisationIds.filter((id: string) => permittedOrgas.orgaIds.includes(id));

            entitiesForIds = await this.em.find(
                OrganisationEntity,
                { id: { $in: organisationIds } },
                {
                    orderBy: {
                        [typeOrderClause as unknown as string]: orderDirection,
                        [sortByField as unknown as string]: orderDirection,
                        [secondSortByField as unknown as string]: 'ASC',
                    },
                },
            );
        }

        let whereClause: FilterQuery<OrganisationEntity> = {};
        const andClauses: FilterQuery<OrganisationEntity>[] = [];
        if (searchOptions.kennung) {
            andClauses.push({ kennung: searchOptions.kennung });
        }
        if (searchOptions.name) {
            andClauses.push({ name: searchOptions.name });
        }
        if (searchOptions.typ) {
            andClauses.push({ typ: searchOptions.typ });
        }
        if (searchOptions.administriertVon) {
            if (searchOptions.getChildrenRecursively) {
                const query: string = `
                    WITH RECURSIVE org_tree AS (
                        SELECT id, administriert_von FROM organisation WHERE administriert_von IN (?)
                        UNION ALL
                        SELECT o.id, o.administriert_von FROM organisation o INNER JOIN org_tree t ON o.administriert_von = t.id
                    )
                    SELECT id FROM org_tree;
                `;
                const rawIds: { id: string }[] = await this.em.execute(query, [searchOptions.administriertVon]);

                const allIds: string[] = rawIds.map((r: { id: string }) => r.id);

                andClauses.push({ id: { $in: allIds } });
            } else {
                andClauses.push({ administriertVon: { $in: searchOptions.administriertVon } });
            }
        }
        if (searchOptions.zugehoerigZu) {
            andClauses.push({ zugehoerigZu: { $in: searchOptions.zugehoerigZu } });
        }
        if (searchOptions.searchString) {
            andClauses.push({
                $or: [
                    { name: { $ilike: `%${searchOptions.searchString}%` } },
                    { kennung: { $ilike: `%${searchOptions.searchString}%` } },
                ],
            });
        }
        if (searchOptions.excludeTyp) {
            andClauses.push({ typ: { $nin: searchOptions.excludeTyp } });
        }
        if (andClauses.length > 0) {
            whereClause = { $and: andClauses };
        }
        // return only permitted organisations
        if (!permittedOrgas.all) {
            whereClause = { $and: [whereClause, { id: { $in: permittedOrgas.orgaIds } }] };
        }

        const [entities, total]: [OrganisationEntity[], number] = await this.em.findAndCount(
            OrganisationEntity,
            whereClause,
            {
                offset: searchOptions.offset,
                limit: searchOptions.limit,
                orderBy: {
                    [typeOrderClause as unknown as string]: orderDirection,
                    [sortByField as unknown as string]: orderDirection,
                    [secondSortByField as unknown as string]: 'ASC',
                },
            },
        );

        const result: OrganisationEntity[] = [...entitiesForIds];
        let duplicates: number = 0;
        for (const entity of entities) {
            if (!result.find((orga: OrganisationEntity) => orga.id === entity.id)) {
                result.push(entity);
            } else {
                duplicates++;
            }
        }

        const organisations: Organisation<true>[] = result.map((entity: OrganisationEntity) =>
            mapOrgaEntityToAggregate(entity),
        );

        // Calculate pageTotal (excluding entitiesForIds when searchString is present
        // Otherwise we show a wrong number in the filter since the selected orgas are always returned regardless if we search for them or not)
        const pageTotal: number = searchOptions.searchString
            ? Math.min(entities.length, searchOptions.limit || entities.length)
            : Math.min(organisations.length, searchOptions.limit || organisations.length);

        // Apply limit to the final result
        if (searchOptions.limit && organisations.length > searchOptions.limit) {
            organisations.splice(searchOptions.limit);
        }

        return [organisations, total + entitiesForIds.length - duplicates, pageTotal];
    }

    public async updateOrganisationName(
        id: string,
        newName: string,
        version: number,
        permissions: IPersonPermissions,
    ): Promise<DomainError | Organisation<true>> {
        const organisationFound: Option<Organisation<true>> = await this.findById(id);

        if (!organisationFound) {
            const error: EntityNotFoundError = new EntityNotFoundError('Organisation', id);
            this.logger.error(
                `Admin: ${permissions.personFields.id}) hat versucht den Namen einer Organisation zu ${newName} zu verändern. Fehler: ${error.message}`,
            );
            return error;
        }
        if (
            !(organisationFound.typ === OrganisationsTyp.KLASSE || organisationFound.typ === OrganisationsTyp.TRAEGER)
        ) {
            const error: EntityCouldNotBeUpdated = new EntityCouldNotBeUpdated('Organisation', id, [
                'Only the name of Klassen or Schulträger can be updated.',
            ]);
            this.logger.error(
                `Admin: ${permissions.personFields.id}) hat versucht den Namen einer Organisation ${organisationFound.name} zu verändern. Fehler: ${error.message}`,
            );
            return error;
        }

        let parentName: string | undefined;
        let parentId: string | undefined;

        if (organisationFound.typ === OrganisationsTyp.KLASSE) {
            // Handle Klasse
            if (organisationFound.administriertVon) {
                const schule: Option<Organisation<true>> = await this.findById(organisationFound.administriertVon);
                if (!schule) {
                    const error: DomainError = new EntityNotFoundError(
                        'Organisation',
                        organisationFound.administriertVon,
                    );
                    this.logger.error(
                        `Admin: ${permissions.personFields.id}) hat versucht den Namen einer Klasse zu ${newName} zu verändern. Fehler: ${error.message}`,
                    );
                    return error;
                }
                parentName = schule.name;

                if (!parentName) {
                    const error: EntityCouldNotBeUpdated = new EntityCouldNotBeUpdated('Organisation', id, [
                        'The schoolName of a Klasse cannot be undefined.',
                    ]);
                    this.logger.error(
                        `Admin: ${permissions.personFields.id}) hat versucht den Namen einer Klasse zu ${newName} zu verändern. Fehler: ${error.message}`,
                    );
                    return error;
                }
                parentId = schule.id;
            }
        }
        if (organisationFound.name !== newName) {
            organisationFound.name = newName;
            // Call the appropriate specification check based on the type
            let specificationError: undefined | OrganisationSpecificationError;
            if (organisationFound.typ === OrganisationsTyp.KLASSE) {
                specificationError = await organisationFound.checkKlasseSpecifications(this);
                if (specificationError) {
                    this.logger.error(
                        `Admin: ${permissions.personFields.id}) hat versucht den Namen einer Klasse zu ${newName} zu verändern. Fehler: ${specificationError.message}`,
                    );
                    return specificationError;
                }
            } else if (organisationFound.typ === OrganisationsTyp.TRAEGER) {
                specificationError = await organisationFound.checkSchultraegerSpecifications(this);
                if (specificationError) {
                    this.logger.error(
                        `Admin: ${permissions.personFields.id}) hat versucht den Namen eines Schulträgers zu ${newName} zu verändern. Fehler: ${specificationError?.message}`,
                    );
                    return specificationError;
                }
            }
        }

        organisationFound.setVersionForUpdate(version);
        const organisationEntity: Organisation<true> | OrganisationSpecificationError =
            await this.save(organisationFound);

        if (organisationFound.typ === OrganisationsTyp.KLASSE) {
            // This is to update the new Klasse in itsLearning
            this.eventService.publish(
                new KlasseUpdatedEvent(id, newName, parentId),
                new KafkaKlasseUpdatedEvent(id, newName, parentId),
            );
        }
        this.logger.info(
            `Admin: ${permissions.personFields.id}) hat den Namen einer Organisation geändert: ${organisationFound.name} (${parentName}).`,
        );

        return organisationEntity;
    }

    public async setEnabledForitslearning(
        personPermissions: IPersonPermissions,
        id: string,
    ): Promise<DomainError | Organisation<true>> {
        if (!(await personPermissions.hasSystemrechteAtRootOrganisation([RollenSystemRecht.SCHULEN_VERWALTEN]))) {
            return new EntityNotFoundError('Organisation', id);
        }

        const organisationEntity: Option<OrganisationEntity> = await this.em.findOne(OrganisationEntity, id);

        if (!organisationEntity) {
            return new EntityNotFoundError('Organisation', id);
        }

        if (organisationEntity.typ !== OrganisationsTyp.SCHULE) {
            return new EntityCouldNotBeUpdated('Organisation', id, [
                'Only organisations of typ SCHULE can be enabled for ITSLearning.',
            ]);
        }

        organisationEntity.itslearningEnabled = true;
        organisationEntity.version += 1;

        this.logger.info(
            `User with personId:${personPermissions.personFields.id} enabled itslearning for organisationId:${id}`,
        );

        await this.em.persist(organisationEntity).flush();

        this.eventService.publish(
            new SchuleItslearningEnabledEvent(
                organisationEntity.id,
                organisationEntity.typ,
                organisationEntity.kennung,
                organisationEntity.name,
            ),
            new KafkaSchuleItslearningEnabledEvent(
                organisationEntity.id,
                organisationEntity.typ,
                organisationEntity.kennung,
                organisationEntity.name,
            ),
        );

        return mapOrgaEntityToAggregate(organisationEntity);
    }

    public async saveSeedData(organisation: Organisation<boolean>): Promise<Organisation<true>> {
        return this.create(organisation);
    }

    private async create(organisation: Organisation<boolean>): Promise<Organisation<true>> {
        const organisationEntity: OrganisationEntity = this.em.create(
            OrganisationEntity,
            mapOrgaAggregateToData(organisation),
        );

        await this.em.persist(organisationEntity).flush();

        if (organisationEntity.typ === OrganisationsTyp.SCHULE) {
            const orgaBaumZuordnung: RootDirectChildrenType = await this.findOrganisationZuordnungErsatzOderOeffentlich(
                organisationEntity.id,
            );
            this.eventService.publish(
                new SchuleCreatedEvent(
                    organisationEntity.id,
                    organisationEntity.kennung,
                    organisationEntity.name,
                    orgaBaumZuordnung,
                ),
                new KafkaSchuleCreatedEvent(
                    organisationEntity.id,
                    organisationEntity.kennung,
                    organisationEntity.name,
                    orgaBaumZuordnung,
                ),
            );
        } else if (organisationEntity.typ === OrganisationsTyp.KLASSE) {
            this.eventService.publish(
                new KlasseCreatedEvent(
                    organisationEntity.id,
                    organisationEntity.name,
                    organisationEntity.administriertVon,
                ),
                new KafkaKlasseCreatedEvent(
                    organisationEntity.id,
                    organisationEntity.name,
                    organisationEntity.administriertVon,
                ),
            );
        }

        return mapOrgaEntityToAggregate(organisationEntity);
    }

    private async update(organisation: Organisation<true>): Promise<Organisation<true>> {
        const organisationEntity: Loaded<OrganisationEntity> = await this.em.findOneOrFail(
            OrganisationEntity,
            organisation.id,
        );

        if (organisationEntity.version !== organisation.version) {
            throw new OrganisationUpdateOutdatedError();
        }
        organisationEntity.version += 1;

        organisationEntity.assign(mapOrgaAggregateToData(organisation));

        await this.em.persist(organisationEntity).flush();

        return mapOrgaEntityToAggregate(organisationEntity);
    }

    public async findOrganisationZuordnungErsatzOderOeffentlich(
        organisationId: OrganisationID,
    ): Promise<RootDirectChildrenType> {
        const [oeffentlich, ersatz]: [Organisation<true> | undefined, Organisation<true> | undefined] =
            await this.findRootDirectChildren();

        const parents: Organisation<true>[] = await this.findParentOrgasForIdSortedByDepthAsc(organisationId);
        for (const parent of parents) {
            if (parent.id === oeffentlich?.id) {
                return RootDirectChildrenType.OEFFENTLICH;
            } else if (parent.id === ersatz?.id) {
                return RootDirectChildrenType.ERSATZ;
            }
        }

        return RootDirectChildrenType.OEFFENTLICH;
    }

    public async delete(organisationId: OrganisationID): Promise<void | DomainError> {
        const entity: OrganisationEntity | null = await this.em.findOne(OrganisationEntity, { id: organisationId });
        if (!entity) {
            return new EntityNotFoundError('Organisation', organisationId);
        }

        this.eventService.publish(
            OrganisationDeletedEvent.fromOrganisation(entity),
            KafkaOrganisationDeletedEvent.fromOrganisation(entity),
        );

        await this.em.remove(entity).flush();

        this.logger.info(`Organisation ${entity.name} vom Typ ${entity.typ} entfernt.`);
    }

    public async findDistinctOrganisationsTypen(organisationIds: OrganisationID[]): Promise<OrganisationsTyp[]> {
        if (organisationIds.length === 0) {
            return [];
        }
        const qb: QueryBuilder<OrganisationEntity> = this.em.createQueryBuilder(OrganisationEntity, 'organisation');
        const result: Pick<Required<OrganisationEntity>, 'typ'>[] = await qb
            .select('typ', true)
            .where({ id: { $in: organisationIds }, typ: { $ne: null } })
            .execute();
        return result.map((r: Pick<Required<OrganisationEntity>, 'typ'>) => r.typ);
    }

    public async findIdsByTypen(typen: OrganisationsTyp[]): Promise<OrganisationID[]> {
        if (typen.length === 0) {
            return [];
        }

        const entities: Loaded<OrganisationEntity, never, 'id', never>[] = await this.em.find(
            OrganisationEntity,
            { typ: { $in: typen } },
            { fields: ['id'] as const },
        );
        const ids: OrganisationID[] = entities.map((e: Loaded<OrganisationEntity, never, 'id', never>) => e.id);

        return ids;
    }
}
