import {
    EntityName,
    FilterQuery,
    ForeignKeyConstraintViolationException,
    Loaded,
    OrderDefinition,
    PopulatePath,
} from '@mikro-orm/core';
import { EntityManager, RawQueryFragment, sql } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { xor } from 'lodash-es';

import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { DomainError, EntityNotFoundError, MissingPermissionsError } from '../../../shared/error/index.js';
import { KafkaRolleUpdatedEvent } from '../../../shared/events/kafka-rolle-updated.event.js';
import { RolleUpdatedEvent } from '../../../shared/events/rolle-updated.event.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID, RolleID, ServiceProviderID } from '../../../shared/types/index.js';
import { Err, UnionToResult } from '../../../shared/util/result.js';
import { intersectPermittedAndRequestedOrgas, PermittedOrgas } from '../../authentication/domain/person-permissions.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { mapEntityToAggregate as mapServiceProviderEntityToAggregate } from '../../service-provider/repo/service-provider-entity-mapper.js';
import { ServiceProviderEntity } from '../../service-provider/repo/service-provider.entity.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { RolleHatPersonenkontexteError } from '../domain/rolle-hat-personenkontexte.error.js';
import { RollenArt, RollenMerkmal } from '../domain/rolle.enums.js';
import { RolleFactory } from '../domain/rolle.factory.js';
import { Rolle } from '../domain/rolle.js';
import { RollenSystemRecht } from '../domain/systemrecht.js';
import { UpdateMerkmaleError } from '../domain/update-merkmale.error.js';
import { RolleUpdateOutdatedError } from '../domain/update-outdated.error.js';
import { RolleMerkmalEntity } from '../entity/rolle-merkmal.entity.js';
import { RolleServiceProviderEntity } from '../entity/rolle-service-provider.entity.js';
import { RolleSystemrechtEntity } from '../entity/rolle-systemrecht.entity.js';
import { RolleEntity } from '../entity/rolle.entity.js';
import { RolleNameNotUniqueOnSskError } from '../specification/error/rolle-name-not-unique-on-ssk.error.js';
import { ServiceProviderNichtNachtraeglichZuweisbarError } from '../specification/error/service-provider-nicht-nachtraeglich-zuweisbar.error.js';
import { NurNachtraeglichZuweisbareServiceProvider } from '../specification/only-assignable-service-providers.specification.js';
import { RolleNameUniqueOnSsk } from '../specification/rolle-name-unique-on-ssk.js';

// Disable explicit types here because it's virtually impossible to do this correctly
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function mapRolleAggregateToData(rolle: Rolle<boolean>) {
    // eslint-disable-next-line @typescript-eslint/typedef
    const merkmale = rolle.merkmale.map((merkmal: RollenMerkmal) => ({
        rolle: rolle.id,
        merkmal,
    }));

    // eslint-disable-next-line @typescript-eslint/typedef
    const systemrechte = rolle.systemrechte.map((systemrecht: RollenSystemRecht) => ({
        rolle: rolle.id,
        systemrecht: systemrecht.name,
    }));

    // eslint-disable-next-line @typescript-eslint/typedef
    const serviceProvider = rolle.serviceProviderIds.map((spId: string) => ({
        rolle: rolle.id,
        serviceProvider: spId,
    }));

    return {
        // Don't assign createdAt and updatedAt, they are auto-generated!
        id: rolle.id,
        name: rolle.name,
        administeredBySchulstrukturknoten: rolle.administeredBySchulstrukturknoten,
        rollenart: rolle.rollenart,
        merkmale,
        systemrechte,
        serviceProvider,
        istTechnisch: rolle.istTechnisch,
        version: rolle.version,
    };
}

export function mapRolleEntityToAggregate(entity: RolleEntity, rolleFactory: RolleFactory): Rolle<boolean> {
    const merkmale: RollenMerkmal[] = entity.merkmale.map((merkmalEntity: RolleMerkmalEntity) => merkmalEntity.merkmal);
    const systemrechte: RollenSystemRecht[] = entity.systemrechte.map((systemRechtEntity: RolleSystemrechtEntity) =>
        RollenSystemRecht.getByName(systemRechtEntity.systemrecht),
    );

    const serviceProviderIds: string[] = entity.serviceProvider.map(
        (serviceProvider: RolleServiceProviderEntity) => serviceProvider.serviceProvider.id,
    );

    const serviceProviderData: ServiceProvider<true>[] = entity.serviceProvider.map(
        (serviceProvider: RolleServiceProviderEntity) => {
            const sp: ServiceProviderEntity = serviceProvider.serviceProvider;
            return mapServiceProviderEntityToAggregate(sp);
        },
    );

    return rolleFactory.construct(
        entity.id,
        entity.createdAt,
        entity.updatedAt,
        entity.version,
        entity.name,
        entity.administeredBySchulstrukturknoten,
        entity.rollenart,
        merkmale,
        systemrechte,
        serviceProviderIds,
        entity.istTechnisch,
        serviceProviderData,
    );
}

export type RolleFindByParameters = {
    includeTechnische?: boolean;
    searchStr?: string;
    allowedOrganisationIds?: OrganisationID[];
    rollenArten?: RollenArt[];
    excludeMerkmale?: RollenMerkmal[];
    requireMerkmale?: RollenMerkmal[];
    merkmale?: RollenMerkmal[];
    rolleIds?: RolleID[];
    serviceProviderIds?: ServiceProviderID[];
    limit?: number;
    offset?: number;
    orderBy?: 'artAndName' | 'name';
};

const rollenartOrderClause: RawQueryFragment = sql`CASE
    WHEN rollenart = 'SYSADMIN' THEN 1
    WHEN rollenart = 'ORGADMIN' THEN 2
    WHEN rollenart = 'LEIT' THEN 3
    WHEN rollenart = 'LEHR' THEN 4
    WHEN rollenart = 'LERN' THEN 5
    WHEN rollenart = 'NLEHR' THEN 6
    WHEN rollenart = 'SCHB' THEN 7
    WHEN rollenart = 'SORGBER' THEN 8
    WHEN rollenart = 'EXTERN' THEN 9
    ELSE 10
END`;

@Injectable()
export class RolleRepo {
    public static readonly DEFAULT_LIMIT: number = 25;

    public constructor(
        protected readonly rolleFactory: RolleFactory,
        private readonly eventService: EventRoutingLegacyKafkaService,
        protected readonly em: EntityManager,
        private readonly serviceProviderRepo: ServiceProviderRepo,
    ) {}

    public get entityName(): EntityName<RolleEntity> {
        return RolleEntity;
    }

    public async findById(id: RolleID, includeTechnical: boolean = false): Promise<Option<Rolle<true>>> {
        const query: { id: RolleID; istTechnisch?: boolean } = includeTechnical ? { id } : { id, istTechnisch: false };

        const rolle: Option<RolleEntity> = await this.em.findOne(this.entityName, query, {
            populate: [
                'merkmale',
                'systemrechte',
                'serviceProvider.serviceProvider',
                'serviceProvider.serviceProvider.merkmale',
                'serviceProvider.serviceProvider.rollenartenWhitelist',
            ] as const,
            exclude: ['serviceProvider.serviceProvider.logo'] as const,
        });

        return rolle && mapRolleEntityToAggregate(rolle, this.rolleFactory);
    }

    public async findByIdAuthorized(
        rolleId: RolleID,
        permissions: IPersonPermissions,
    ): Promise<Result<Rolle<true>, EntityNotFoundError | MissingPermissionsError>> {
        const rolle: Option<Rolle<true>> = await this.findById(rolleId);
        if (!rolle) {
            return {
                ok: false,
                error: new EntityNotFoundError(),
            };
        }

        const rolleAdministeringOrganisationId: OrganisationID = rolle.administeredBySchulstrukturknoten;

        const relevantSystemRechte: RollenSystemRecht[] = [RollenSystemRecht.ROLLEN_VERWALTEN];

        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(relevantSystemRechte, true);
        if (permittedOrgas.all || permittedOrgas.orgaIds.includes(rolleAdministeringOrganisationId)) {
            return {
                ok: true,
                value: rolle,
            };
        }
        return {
            ok: false,
            error: new MissingPermissionsError('Not allowed to view the requested rolle.'),
        };
    }

    public async findByIds(ids: RolleID[]): Promise<Map<string, Rolle<true>>> {
        const rollenEntities: RolleEntity[] = await this.em.find(
            RolleEntity,
            { id: { $in: ids } },
            {
                populate: [
                    'merkmale',
                    'systemrechte',
                    'serviceProvider.serviceProvider',
                    'serviceProvider.serviceProvider.merkmale',
                    'serviceProvider.serviceProvider.rollenartenWhitelist',
                ] as const,
                exclude: ['serviceProvider.serviceProvider.logo'] as const,
            },
        );

        const rollenMap: Map<string, Rolle<true>> = new Map();
        rollenEntities.forEach((rolleEntity: RolleEntity) => {
            const rolle: Rolle<true> = mapRolleEntityToAggregate(rolleEntity, this.rolleFactory);
            rollenMap.set(rolleEntity.id, rolle);
        });

        return rollenMap;
    }

    public async findByName(
        searchStr: string,
        includeTechnische: boolean,
        limit?: number,
        offset?: number,
        rollenarten?: RollenArt[],
    ): Promise<Rolle<true>[]> {
        const technischeQuery: { istTechnisch?: false } = includeTechnische ? {} : { istTechnisch: false };
        const rollenartQuery: Record<string, unknown> =
            rollenarten && rollenarten.length > 0 ? { rollenart: { $in: rollenarten } } : {};

        const rollen: RolleEntity[] = await this.em.find(
            this.entityName,
            { name: { $ilike: '%' + searchStr + '%' }, ...rollenartQuery, ...technischeQuery },
            {
                populate: [
                    'merkmale',
                    'systemrechte',
                    'serviceProvider.serviceProvider',
                    'serviceProvider.serviceProvider.merkmale',
                    'serviceProvider.serviceProvider.rollenartenWhitelist',
                ] as const,
                exclude: ['serviceProvider.serviceProvider.logo'] as const,
                limit: limit,
                offset: offset,
            },
        );
        return rollen.map((rolle: RolleEntity) => mapRolleEntityToAggregate(rolle, this.rolleFactory));
    }

    public async findByRollenArten(
        includeTechnische: boolean,
        limit?: number,
        offset?: number,
        rollenarten?: RollenArt[],
    ): Promise<Rolle<true>[]> {
        const technischeQuery: { istTechnisch?: false } = includeTechnische ? {} : { istTechnisch: false };
        const rollenartQuery: Record<string, unknown> =
            rollenarten && rollenarten.length > 0 ? { rollenart: { $in: rollenarten } } : {};

        const rollen: RolleEntity[] = await this.em.findAll(RolleEntity, {
            populate: [
                'merkmale',
                'systemrechte',
                'serviceProvider.serviceProvider',
                'serviceProvider.serviceProvider.merkmale',
                'serviceProvider.serviceProvider.rollenartenWhitelist',
            ] as const,
            exclude: ['serviceProvider.serviceProvider.logo'] as const,
            where: { ...technischeQuery, ...rollenartQuery },
            limit: limit,
            offset: offset,
        });

        return rollen.map((rolle: RolleEntity) => mapRolleEntityToAggregate(rolle, this.rolleFactory));
    }

    public async findBy(params: RolleFindByParameters): Promise<Counted<Rolle<true>>> {
        const queries: Array<FilterQuery<NoInfer<RolleEntity>>> = [];
        if (params.includeTechnische === undefined || params.includeTechnische === false) {
            queries.push({ istTechnisch: false });
        }
        if (params.rollenArten) {
            queries.push({ rollenart: params.rollenArten });
        }
        if (params.allowedOrganisationIds) {
            queries.push({ administeredBySchulstrukturknoten: params.allowedOrganisationIds });
        }
        if (params.searchStr) {
            queries.push({ name: { $ilike: '%' + params.searchStr + '%' } });
        }
        if (params.excludeMerkmale) {
            for (const merkmal of params.excludeMerkmale) {
                queries.push({ merkmale: { $none: { merkmal } } });
            }
        }
        if (params.requireMerkmale) {
            for (const merkmal of params.requireMerkmale) {
                queries.push({ merkmale: { $some: { merkmal } } });
            }
        }
        if (params.merkmale) {
            queries.push({ merkmale: { merkmal: { $in: params.merkmale } } });
        }
        if (params.serviceProviderIds && params.serviceProviderIds.length > 0) {
            queries.push({ serviceProvider: { serviceProvider: { id: { $in: params.serviceProviderIds } } } });
        }

        const baseQuery: FilterQuery<NoInfer<RolleEntity>> = { $and: queries };

        // TODO: this can fail if there are more rollen than limit
        const finalQuery: FilterQuery<NoInfer<RolleEntity>> = params.rolleIds?.length
            ? { $or: [baseQuery, { id: { $in: params.rolleIds } }] }
            : baseQuery;

        const orderBy: OrderDefinition<RolleEntity> | undefined = this.mapParametersToOrderDefinition(params);

        const [rollen, total]: Counted<RolleEntity> = await this.em.findAndCount(RolleEntity, finalQuery, {
            populate: [
                'merkmale',
                'systemrechte',
                'serviceProvider.serviceProvider',
                'serviceProvider.serviceProvider.merkmale',
                'serviceProvider.serviceProvider.rollenartenWhitelist',
            ] as const,
            exclude: ['serviceProvider.serviceProvider.logo'] as const,
            limit: params.limit,
            offset: params.offset,
            orderBy,
        });

        return [rollen.map((rolle: RolleEntity) => mapRolleEntityToAggregate(rolle, this.rolleFactory)), total];
    }

    private mapParametersToOrderDefinition(params: RolleFindByParameters): OrderDefinition<RolleEntity> | undefined {
        switch (params.orderBy) {
            case 'artAndName':
                return [{ [rollenartOrderClause as unknown as string]: 'ASC' }, { name: 'ASC' }];
            case 'name':
                return [{ name: 'ASC' }];
            default:
                return;
        }
    }

    public async findRollenAuthorized(
        permissions: IPersonPermissions,
        systemrechte: RollenSystemRecht[] | undefined,
        includeTechnische: boolean,
        searchStr?: string,
        limit?: number,
        offset?: number,
        organisationIds?: OrganisationID[],
        rolleIds?: RolleID[],
        merkmale?: RollenMerkmal[],
        rollenArten?: RollenArt[],
        serviceProviderIds?: ServiceProviderID[],
    ): Promise<[Rolle<true>[], number]> {
        // Fallback to ROLLEN_VERWALTEN if no systemrechte are provided (this is the default behavior expected from the frontend)
        const orgIdsWithRecht: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            systemrechte ?? [RollenSystemRecht.ROLLEN_VERWALTEN],
            false,
        );
        if (!orgIdsWithRecht.all && orgIdsWithRecht.orgaIds.length === 0) {
            return [[], 0];
        }

        let allowedOrganisationIds: OrganisationID[] | undefined;
        if (organisationIds && organisationIds.length > 0) {
            allowedOrganisationIds = intersectPermittedAndRequestedOrgas(orgIdsWithRecht, organisationIds);
        } else if (!orgIdsWithRecht.all) {
            allowedOrganisationIds = orgIdsWithRecht.orgaIds;
        }

        // we can assume that MPT_ROLLEN_VERWALTEN is not exclusive to a single orga here, since matchAll on permissions.getOrgIdsWithSystemrecht is true by default
        const hasMptRollenVerwaltenPermission: boolean =
            systemrechte?.includes(RollenSystemRecht.MPT_ROLLEN_VERWALTEN) ?? false;
        const excludeMerkmale: RollenMerkmal[] | undefined = hasMptRollenVerwaltenPermission
            ? undefined
            : [RollenMerkmal.MPT_ROLLE];

        return this.findBy({
            includeTechnische,
            searchStr,
            limit,
            offset,
            allowedOrganisationIds,
            excludeMerkmale,
            rolleIds,
            orderBy: 'artAndName',
            merkmale,
            rollenArten,
            serviceProviderIds,
        });
    }

    public async findBySchulstrukturknoten(administeredBySchulstrukturknoten: OrganisationID): Promise<Rolle<true>[]> {
        return (
            await this.em.find(
                this.entityName,
                { administeredBySchulstrukturknoten },
                {
                    populate: [
                        'merkmale',
                        'systemrechte',
                        'serviceProvider.serviceProvider',
                        'serviceProvider.serviceProvider.merkmale',
                        'serviceProvider.serviceProvider.rollenartenWhitelist',
                    ] as const,
                    exclude: ['serviceProvider.serviceProvider.logo'] as const,
                },
            )
        ).map((rolleEntity: RolleEntity) => mapRolleEntityToAggregate(rolleEntity, this.rolleFactory));
    }

    public async findByServiceProviderIds(
        serviceProviderIds: string[],
        limitPerProvider: number = Infinity,
    ): Promise<Map<ServiceProviderID, Rolle<true>[]>> {
        if (serviceProviderIds.length === 0) {
            return new Map();
        }

        // Load *all* Rollen that have one of the specified providers.
        // We can assume there won't be thousands of Rollen in the system and this easier to maintain

        // For future reference, the following sql can be used as a starting point if we need to optimize this further
        // SELECT "sp"."id", "sp"."name", "r"."name" FROM "service_provider" AS "sp" LEFT JOIN LATERAL( SELECT DISTINCT "r_inner".* FROM "rolle" AS "r_inner" JOIN "rolle_service_provider" AS "rsp_inner" ON "rsp_inner"."service_provider_id" = "sp"."id" ORDER BY "r_inner"."name" ASC LIMIT 2) AS "r" ON TRUE WHERE "sp"."id" IN (?) ORDER BY "sp"."name" ASC

        const result: Loaded<RolleEntity, 'serviceProvider', PopulatePath.ALL, never>[] = await this.em.find(
            RolleEntity,
            {
                serviceProvider: {
                    serviceProvider: {
                        id: {
                            $in: serviceProviderIds,
                        },
                    },
                },
            },
            {
                orderBy: { name: 'ASC' },
                populateWhere: 'infer',
                populate: ['serviceProvider.serviceProvider'],
            },
        );

        const rollenMap: Map<ServiceProviderID, Rolle<true>[]> = new Map(
            serviceProviderIds.map((id: ServiceProviderID) => [id, []]),
        );

        // Iterate through every Rolle (already sorted by name) and append them to the map for each ServiceProvider (stop adding after each list has reached 'limitPerProvider' count)
        for (const rolle of result) {
            for (const sp of rolle.serviceProvider) {
                const mapArray: Rolle<true>[] | undefined = rollenMap.get(sp.serviceProvider.id);
                if (mapArray && mapArray.length < limitPerProvider) {
                    mapArray.push(mapRolleEntityToAggregate(rolle, this.rolleFactory));
                }
            }
        }

        return rollenMap;
    }

    public async findRollenAvailableForPersonenkontextCreation(params: {
        organisationId: OrganisationID;
        allowedOrganisationIds: Array<OrganisationID>;
        allowedRollenarten: Array<RollenArt>;
        mpt?: {
            allowedRollenarten: Array<RollenArt>;
        };
        searchStr?: string;
        stickyRollenIds?: Array<RolleID>;
        limit?: number;
        offset?: number;
    }): Promise<Counted<Rolle<true>>> {
        const stickyRollenEntities: Array<RolleEntity> = params.stickyRollenIds
            ? await this.em.findAll(RolleEntity, {
                  where: {
                      id: { $in: params.stickyRollenIds },
                  },
                  populate: [
                      'merkmale',
                      'systemrechte',
                      'serviceProvider.serviceProvider',
                      'serviceProvider.serviceProvider.merkmale',
                      'serviceProvider.serviceProvider.rollenartenWhitelist',
                  ] as const,
                  exclude: ['serviceProvider.serviceProvider.logo'] as const,
              })
            : [];

        const where: FilterQuery<NoInfer<RolleEntity>> = {
            administeredBySchulstrukturknoten: { $in: params.allowedOrganisationIds },
        };
        if (params.stickyRollenIds) {
            where.id = { $nin: params.stickyRollenIds };
        }
        if (params.searchStr) {
            where.name = { $ilike: `%${params.searchStr}%` };
        }
        if (params.mpt) {
            where.$or = [
                {
                    rollenart: { $in: params.allowedRollenarten },
                    merkmale: { $none: { merkmal: RollenMerkmal.MPT_ROLLE } },
                },
                {
                    rollenart: { $in: params.mpt.allowedRollenarten },
                    merkmale: { $some: { merkmal: RollenMerkmal.MPT_ROLLE } },
                },
            ];
        } else {
            where.rollenart = { $in: params.allowedRollenarten };
            where.merkmale = { $none: { merkmal: RollenMerkmal.MPT_ROLLE } };
        }
        const [rollenEntities, count]: Counted<RolleEntity> = await this.em.findAndCount(RolleEntity, where, {
            populate: [
                'merkmale',
                'systemrechte',
                'serviceProvider.serviceProvider',
                'serviceProvider.serviceProvider.merkmale',
                'serviceProvider.serviceProvider.rollenartenWhitelist',
            ] as const,
            exclude: ['serviceProvider.serviceProvider.logo'] as const,
            limit: params.limit,
            offset: params.offset,
        });

        return [
            stickyRollenEntities
                .concat(rollenEntities)
                .map((entity: RolleEntity) => mapRolleEntityToAggregate(entity, this.rolleFactory)),
            count,
        ];
    }

    public async existsForServiceProviderId(
        serviceProviderId: ServiceProviderID,
        rollenarten?: RollenArt[],
    ): Promise<boolean> {
        const rollenartQuery: Record<string, unknown> =
            rollenarten && rollenarten.length > 0 ? { rollenart: { $in: rollenarten } } : {};

        const rolle: Option<Loaded<RolleEntity, never, 'id', never>> = await this.em.findOne(
            RolleEntity,
            {
                ...rollenartQuery,
                serviceProvider: {
                    serviceProvider: {
                        id: serviceProviderId,
                    },
                },
            },
            { fields: ['id'] as const },
        );

        return !!rolle;
    }

    public async exists(id: RolleID): Promise<boolean> {
        const rolle: Option<Loaded<RolleEntity, never, 'id', never>> = await this.em.findOne(
            RolleEntity,
            { id },
            { fields: ['id'] as const },
        );

        return !!rolle;
    }

    public async save(rolle: Rolle<boolean>): Promise<Rolle<true> | DomainError> {
        const rolleNameUniqueOnSSK: RolleNameUniqueOnSsk = new RolleNameUniqueOnSsk(this, rolle.name);
        if (!(await rolleNameUniqueOnSSK.isSatisfiedBy(rolle))) {
            return new RolleNameNotUniqueOnSskError();
        }

        if (rolle.id) {
            return this.update(rolle);
        } else {
            return this.create(rolle);
        }
    }

    public async createRolleAuthorized(
        rolle: Rolle<false>,
        permissions: IPersonPermissions,
    ): Promise<Result<Rolle<true>, DomainError>> {
        const hasPermission: boolean = await permissions.hasSystemrechtAtOrganisation(
            rolle.administeredBySchulstrukturknoten,
            RollenSystemRecht.ROLLEN_VERWALTEN,
        );
        if (!hasPermission) {
            return Err(new MissingPermissionsError('Not authorized to create Rollen at this organisation'));
        }

        const validationResult: Result<void, DomainError> = await rolle.validate();
        if (!validationResult.ok) {
            return validationResult;
        }

        return UnionToResult(await this.save(rolle));
    }

    public async updateRolleAuthorized(
        id: string,
        name: string,
        merkmale: RollenMerkmal[],
        systemrechte: RollenSystemRecht[],
        serviceProviderIds: string[],
        version: number,
        isAlreadyAssigned: boolean,
        permissions: IPersonPermissions,
    ): Promise<Result<Rolle<true>, DomainError>> {
        //Reference & Permissions
        const authorizedRoleResult: Result<Rolle<true>, DomainError> = await this.findByIdAuthorized(id, permissions);
        if (!authorizedRoleResult.ok) {
            return authorizedRoleResult;
        }

        const authorizedRole: Rolle<true> = authorizedRoleResult.value;

        //Specifications
        if (isAlreadyAssigned) {
            const willMerkmaleChange: boolean = xor(merkmale, authorizedRole.merkmale).length !== 0;
            if (willMerkmaleChange) {
                return Err(new UpdateMerkmaleError());
            }
        }

        const updatedRolle: Rolle<true> = this.rolleFactory.construct(
            authorizedRole.id,
            authorizedRole.createdAt,
            authorizedRole.updatedAt,
            version,
            name,
            authorizedRole.administeredBySchulstrukturknoten,
            authorizedRole.rollenart,
            merkmale,
            systemrechte,
            serviceProviderIds,
            authorizedRole.istTechnisch,
            [],
        );

        const validationResult: Result<void, DomainError> = await updatedRolle.validate();
        if (!validationResult.ok) {
            return validationResult;
        }

        if (isAlreadyAssigned) {
            const spec: NurNachtraeglichZuweisbareServiceProvider = new NurNachtraeglichZuweisbareServiceProvider(
                this.serviceProviderRepo,
                authorizedRole,
            );
            if (!(await spec.isSatisfiedBy(updatedRolle))) {
                return Err(new ServiceProviderNichtNachtraeglichZuweisbarError());
            }
        }

        return UnionToResult(await this.save(updatedRolle));
    }

    public async deleteAuthorized(
        id: RolleID,
        permissions: IPersonPermissions,
    ): Promise<Option<RolleHatPersonenkontexteError | EntityNotFoundError | MissingPermissionsError>> {
        const rolle: Result<Rolle<true>, EntityNotFoundError | MissingPermissionsError> = await this.findByIdAuthorized(
            id,
            permissions,
        );
        if (!rolle.ok) {
            return rolle.error;
        }

        try {
            const entity: RolleEntity = this.em.create(RolleEntity, mapRolleAggregateToData(rolle.value));
            await this.em.remove(entity).flush();
        } catch (ex) {
            if (ex instanceof ForeignKeyConstraintViolationException) {
                return new RolleHatPersonenkontexteError();
            }
            throw ex;
        }
        return;
    }

    public async create(rolle: Rolle<false>): Promise<Rolle<true>> {
        const rolleEntity: RolleEntity = this.em.create(RolleEntity, mapRolleAggregateToData(rolle));

        await this.em.persist(rolleEntity).flush();

        // Populate the service providers so the data can be mapped even on newly created rollen
        await this.em.populate(
            rolleEntity,
            [
                'serviceProvider.serviceProvider',
                'serviceProvider.serviceProvider.merkmale',
                'serviceProvider.serviceProvider.rollenartenWhitelist',
            ] as const,
            {
                exclude: ['serviceProvider.serviceProvider.logo'] as const,
            },
        );

        return mapRolleEntityToAggregate(rolleEntity, this.rolleFactory);
    }

    private async update(rolle: Rolle<true>): Promise<Rolle<true>> {
        const rolleEntity: Loaded<RolleEntity> = await this.em.findOneOrFail(RolleEntity, rolle.id, {
            populate: [
                'merkmale',
                'systemrechte',
                'serviceProvider.serviceProvider',
                'serviceProvider.serviceProvider.merkmale',
                'serviceProvider.serviceProvider.rollenartenWhitelist',
            ] as const,
            exclude: ['serviceProvider.serviceProvider.logo'] as const,
        });

        if (rolleEntity.version !== rolle.version) {
            throw new RolleUpdateOutdatedError();
        }
        rolle.version = rolle.version + 1;

        const oldRolle: Rolle<true> = mapRolleEntityToAggregate(rolleEntity, this.rolleFactory);

        rolleEntity.assign(mapRolleAggregateToData(rolle), { updateNestedEntities: true });
        await this.em.persist(rolleEntity).flush();

        const updatedRolle: Rolle<true> = mapRolleEntityToAggregate(rolleEntity, this.rolleFactory);
        this.eventService.publish(
            RolleUpdatedEvent.fromRollen(updatedRolle, oldRolle),
            KafkaRolleUpdatedEvent.fromRollen(updatedRolle, oldRolle),
        );

        return updatedRolle;
    }
}
