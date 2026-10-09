import {
    Dictionary,
    FilterQuery,
    Loaded,
    PopulatePath,
    RequiredEntityData,
    Subquery,
    UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { EntityManager, QueryBuilder } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/error/domain.error.js';
import { OrganisationID, RolleID, ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { Ok } from '../../../shared/util/result.js';
import { RollenArt } from '../domain/rolle.enums.js';
import { RollenerweiterungFactory } from '../domain/rollenerweiterung.factory.js';
import { Rollenerweiterung } from '../domain/rollenerweiterung.js';
import { RollenerweiterungEntity } from '../entity/rollenerweiterung.entity.js';

export type RollenerweiterungIds = {
    organisationId: OrganisationID;
    rolleId: RolleID;
    serviceProviderId: ServiceProviderID;
};

/**
 * Internal persistence repository for Rollenerweiterungen.
 *
 * This repository performs no authorization or domain consistency checks.
 * Calling services are responsible for authorization.
 * Domain consistency must be checked through the Rollenerweiterung aggregate.
 */
@Injectable()
export class InternalRollenerweiterungRepo {
    public constructor(
        protected readonly em: EntityManager,
        protected readonly rollenerweiterungFactory: RollenerweiterungFactory,
    ) {}

    private mapAggregateToEntityData(
        rollenerweiterung: Rollenerweiterung<false>,
    ): RequiredEntityData<RollenerweiterungEntity> {
        return {
            organisationId: rollenerweiterung.organisationId,
            rolleId: rollenerweiterung.rolleId,
            serviceProviderId: rollenerweiterung.serviceProviderId,
        };
    }

    private mapEntityToAggregate(rollenerweiterung: RollenerweiterungEntity): Rollenerweiterung<true> {
        return this.rollenerweiterungFactory.construct(
            rollenerweiterung.id,
            rollenerweiterung.createdAt,
            rollenerweiterung.updatedAt,
            rollenerweiterung.organisationId.id,
            rollenerweiterung.rolleId.id,
            rollenerweiterung.serviceProviderId.id,
        );
    }

    private getComposedIdFilter({
        organisationId,
        rolleId,
        serviceProviderId,
    }: RollenerweiterungIds): FilterQuery<RollenerweiterungEntity> {
        return {
            organisationId,
            rolleId,
            serviceProviderId,
        };
    }

    public async exists(ids: RollenerweiterungIds): Promise<boolean> {
        const count: number = await this.em.count(RollenerweiterungEntity, this.getComposedIdFilter(ids));

        return count > 0;
    }

    public async existsByOrganisationId(organisationId: OrganisationID): Promise<boolean> {
        const count: number = await this.em.count(RollenerweiterungEntity, {
            organisationId,
        });

        return count > 0;
    }

    public async findByComposedId(ids: RollenerweiterungIds): Promise<Rollenerweiterung<true> | undefined> {
        const entity: Loaded<RollenerweiterungEntity> | null = await this.em.findOne(
            RollenerweiterungEntity,
            this.getComposedIdFilter(ids),
        );

        if (!entity) {
            return undefined;
        }

        return this.mapEntityToAggregate(entity);
    }

    public async create(rollenerweiterung: Rollenerweiterung<false>): Promise<Rollenerweiterung<true>> {
        const ids: RollenerweiterungIds = {
            organisationId: rollenerweiterung.organisationId,
            rolleId: rollenerweiterung.rolleId,
            serviceProviderId: rollenerweiterung.serviceProviderId,
        };

        const existingRollenerweiterung: Rollenerweiterung<true> | undefined = await this.findByComposedId(ids);

        if (existingRollenerweiterung) {
            return existingRollenerweiterung;
        }

        const rollenerweiterungEntity: RollenerweiterungEntity = this.em.create(
            RollenerweiterungEntity,
            this.mapAggregateToEntityData(rollenerweiterung),
        );

        try {
            await this.em.persist(rollenerweiterungEntity).flush();

            return this.mapEntityToAggregate(rollenerweiterungEntity);
        } catch (error: unknown) {
            if (error instanceof UniqueConstraintViolationException) {
                const concurrentlyCreatedRollenerweiterung: Rollenerweiterung<true> | undefined =
                    await this.findByComposedId(ids);

                if (concurrentlyCreatedRollenerweiterung) {
                    return concurrentlyCreatedRollenerweiterung;
                }
            }

            throw error;
        }
    }

    public async findManyByOrganisationAndRolle(
        query: Array<Pick<Rollenerweiterung<boolean>, 'organisationId' | 'rolleId'>>,
    ): Promise<Rollenerweiterung<true>[]> {
        if (query.length === 0) {
            return [];
        }

        const rollenerweiterungen: Loaded<RollenerweiterungEntity>[] = await this.em.find(RollenerweiterungEntity, {
            $or: query.map(
                ({
                    organisationId,
                    rolleId,
                }: Pick<Rollenerweiterung<boolean>, 'organisationId' | 'rolleId'>): {
                    organisationId: OrganisationID;
                    rolleId: RolleID;
                } => ({
                    organisationId,
                    rolleId,
                }),
            ),
        });

        return rollenerweiterungen.map(
            (entity: Loaded<RollenerweiterungEntity>): Rollenerweiterung<true> => this.mapEntityToAggregate(entity),
        );
    }

    public async findManyByRolleId(rolleId: RolleID): Promise<Rollenerweiterung<true>[]> {
        const rollenerweiterungEntities: Loaded<RollenerweiterungEntity>[] = await this.em.find(
            RollenerweiterungEntity,
            {
                rolleId,
            },
        );

        return rollenerweiterungEntities.map(
            (entity: Loaded<RollenerweiterungEntity>): Rollenerweiterung<true> => this.mapEntityToAggregate(entity),
        );
    }

    public async findManyByOrganisationId(
        organisationId: OrganisationID,
        offset?: number,
        limit?: number,
    ): Promise<Rollenerweiterung<true>[]> {
        const rollenerweiterungEntities: Loaded<RollenerweiterungEntity>[] = await this.em.find(
            RollenerweiterungEntity,
            {
                organisationId,
            },
            {
                offset,
                limit,
            },
        );

        return rollenerweiterungEntities.map(
            (entity: Loaded<RollenerweiterungEntity>): Rollenerweiterung<true> => this.mapEntityToAggregate(entity),
        );
    }

    public async findManyByOrganisationIdAndServiceProviderId(
        organisationId: OrganisationID,
        serviceProviderId: ServiceProviderID,
    ): Promise<Rollenerweiterung<true>[]> {
        const rollenerweiterungEntities: Loaded<RollenerweiterungEntity>[] = await this.em.find(
            RollenerweiterungEntity,
            {
                organisationId,
                serviceProviderId,
            },
        );

        return rollenerweiterungEntities.map(
            (entity: Loaded<RollenerweiterungEntity>): Rollenerweiterung<true> => this.mapEntityToAggregate(entity),
        );
    }

    public async deleteByComposedId(ids: RollenerweiterungIds): Promise<Result<null, DomainError>> {
        await this.em.nativeDelete(RollenerweiterungEntity, this.getComposedIdFilter(ids));

        return Ok(null);
    }

    public async deleteByOrganisationIdAndServiceProviderIds(
        organisationId: OrganisationID,
        serviceProviderIds: ServiceProviderID[],
    ): Promise<Result<null, DomainError>> {
        if (serviceProviderIds.length === 0) {
            return Ok(null);
        }

        await this.em.nativeDelete(RollenerweiterungEntity, {
            organisationId,
            serviceProviderId: {
                $in: serviceProviderIds,
            },
        });

        return Ok(null);
    }

    public async deleteByServiceProviderIdAndRollenarten(
        serviceProviderId: ServiceProviderID,
        rollenarten?: RollenArt[],
    ): Promise<Result<null, DomainError>> {
        await this.em.nativeDelete(
            RollenerweiterungEntity,
            this.getServiceProviderAndRollenartenFilter(serviceProviderId, rollenarten),
        );

        return Ok(null);
    }

    /**
     * Returns the amount of Rollenerweiterungen per ServiceProvider,
     * optionally filtered by Organisations.
     */
    public async countByServiceProviderIds(
        serviceProviderIds: ServiceProviderID[],
        organisationIds?: OrganisationID[],
    ): Promise<Record<ServiceProviderID, number>> {
        const where: FilterQuery<RollenerweiterungEntity> = {
            serviceProviderId: {
                $in: serviceProviderIds,
            },
        };

        if (organisationIds) {
            where.organisationId = {
                $in: organisationIds,
            };
        }

        const result: Dictionary<number> = await this.em.countBy(
            RollenerweiterungEntity,
            ['serviceProviderId'] as const,
            {
                where,
            },
        );

        for (const id of serviceProviderIds) {
            result[id] ??= 0;
        }

        return result;
    }

    /**
     * Returns at most five Rollenerweiterungen per ServiceProvider.
     */
    public async findByServiceProviderIds(
        serviceProviderIds: ServiceProviderID[],
        organisationIds?: OrganisationID[],
    ): Promise<Map<ServiceProviderID, Rollenerweiterung<true>[]>> {
        if (serviceProviderIds.length === 0) {
            return new Map();
        }

        if (organisationIds && organisationIds.length === 0) {
            return new Map(
                serviceProviderIds.map((id: ServiceProviderID): [ServiceProviderID, Rollenerweiterung<true>[]] => [
                    id,
                    [],
                ]),
            );
        }

        const filter: FilterQuery<RollenerweiterungEntity> = {
            serviceProviderId: {
                $in: serviceProviderIds,
            },
        };

        if (organisationIds) {
            filter.organisationId = {
                $in: organisationIds,
            };
        }

        const result: Loaded<RollenerweiterungEntity, 'serviceProvider', PopulatePath.ALL, never>[] =
            await this.em.find(RollenerweiterungEntity, filter, {
                populateWhere: 'infer',
                orderBy: {
                    rolleId: {
                        name: 'ASC',
                    },
                },
            });

        const rollenErweiterungMap: Map<ServiceProviderID, Rollenerweiterung<true>[]> = new Map(
            serviceProviderIds.map((id: ServiceProviderID): [ServiceProviderID, Rollenerweiterung<true>[]] => [id, []]),
        );

        for (const rollenerweiterung of result) {
            const mapArray: Rollenerweiterung<true>[] | undefined = rollenErweiterungMap.get(
                rollenerweiterung.serviceProviderId.id,
            );

            if (mapArray && mapArray.length < 5) {
                mapArray.push(this.mapEntityToAggregate(rollenerweiterung));
            }
        }

        return rollenErweiterungMap;
    }

    /*
     * Neither the organisations nor the Rollen are loaded directly here.
     * Otherwise, the same aggregates would be loaded repeatedly for each
     * Rollenerweiterung.
     */
    public async findByServiceProviderIdPagedAndSortedByOrgaKennung(
        serviceProviderId: ServiceProviderID,
        organisationIds?: OrganisationID[],
        rolleIds?: RolleID[],
        offset?: number,
        limit?: number,
    ): Promise<Counted<Rollenerweiterung<true>>> {
        if (organisationIds && organisationIds.length === 0) {
            return [[], 0];
        }

        // eslint-disable-next-line @typescript-eslint/typedef
        let qb = this.em
            .createQueryBuilder(RollenerweiterungEntity, 're')
            .innerJoinAndSelect('re.organisationId', 'o')
            .select(['re.organisationId.id', 'o.kennung'] as const)
            .distinct()
            .where({
                're.serviceProviderId': serviceProviderId,
            });

        qb = qb
            .orderBy({
                'o.kennung': 'ASC',
            })
            .limit(limit ?? 999999)
            .offset(offset ?? 0);

        if (organisationIds && organisationIds.length > 0) {
            qb = qb.andWhere({
                organisationId: {
                    $in: organisationIds,
                },
            });
        }

        if (rolleIds && rolleIds.length > 0) {
            qb = qb.andWhere({
                rolleId: {
                    $in: rolleIds,
                },
            });
        }

        const pagedOrgIdsResult: Array<{
            id: OrganisationID;
            kennung: string;
        }> = await qb.execute();

        const pagedOrgIds: OrganisationID[] = pagedOrgIdsResult.map(
            (row: { id: OrganisationID }): OrganisationID => row.id,
        );

        const countQb: QueryBuilder<RollenerweiterungEntity, 're'> = this.em.createQueryBuilder(
            RollenerweiterungEntity,
            're',
        );

        countQb.count('re.organisationId', true).where({
            serviceProviderId,
        });

        if (organisationIds && organisationIds.length > 0) {
            countQb.andWhere({
                organisationId: {
                    $in: organisationIds,
                },
            });
        }

        if (rolleIds && rolleIds.length > 0) {
            countQb.andWhere({
                rolleId: {
                    $in: rolleIds,
                },
            });
        }

        const countResult: {
            count: string | number;
        } = await countQb.execute('get', true);

        const totalUniqueOrgs: number = Number(countResult.count);

        if (pagedOrgIds.length === 0) {
            return [[], totalUniqueOrgs];
        }

        const [rollenerweiterungEntities]: Counted<Loaded<RollenerweiterungEntity>> = await this.em.findAndCount(
            RollenerweiterungEntity,
            {
                serviceProviderId,
                organisationId: {
                    $in: pagedOrgIds,
                },
                ...(rolleIds && rolleIds.length > 0
                    ? {
                          rolleId: {
                              $in: rolleIds,
                          },
                      }
                    : {}),
            },
            {
                orderBy: {
                    organisationId: {
                        kennung: 'ASC',
                    },
                    id: 'ASC',
                },
                populateWhere: 'infer',
            },
        );

        const rollenerweiterungen: Rollenerweiterung<true>[] = rollenerweiterungEntities.map(
            (entity: Loaded<RollenerweiterungEntity>): Rollenerweiterung<true> => this.mapEntityToAggregate(entity),
        );

        return [rollenerweiterungen, totalUniqueOrgs];
    }

    public async findByServiceProviderIdAndRollenarten(
        serviceProviderId: ServiceProviderID,
        rollenarten?: RollenArt[],
    ): Promise<Rollenerweiterung<true>[]> {
        const entities: Loaded<RollenerweiterungEntity>[] = await this.em.find(
            RollenerweiterungEntity,
            this.getServiceProviderAndRollenartenFilter(serviceProviderId, rollenarten),
        );

        return entities.map(
            (entity: Loaded<RollenerweiterungEntity>): Rollenerweiterung<true> => this.mapEntityToAggregate(entity),
        );
    }

    private getServiceProviderAndRollenartenFilter(
        serviceProviderId: ServiceProviderID,
        rollenarten?: RollenArt[],
    ): FilterQuery<RollenerweiterungEntity> {
        const where: FilterQuery<RollenerweiterungEntity> = {
            serviceProviderId,
        };

        if (rollenarten && rollenarten.length > 0) {
            const rollenSubquery: Subquery = this.em
                .createQueryBuilder(RollenerweiterungEntity, 're')
                .select('re.rolleId')
                .innerJoin('re.rolleId', 'r')
                .where({
                    're.serviceProviderId': serviceProviderId,
                    'r.rollenart': {
                        $in: rollenarten,
                    },
                });

            where.rolleId = {
                $in: rollenSubquery,
            };
        }

        return where;
    }
}
