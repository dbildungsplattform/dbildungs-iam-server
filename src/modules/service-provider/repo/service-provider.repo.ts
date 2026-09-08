import { FilterQuery, Loaded, Subquery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID, RolleID, ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { PermittedOrgas } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { OrganisationEntity } from '../../organisation/persistence/organisation.entity.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RolleServiceProviderEntity } from '../../rolle/entity/rolle-service-provider.entity.js';
import { ServiceProviderMerkmal } from '../domain/service-provider.enum.js';
import { ServiceProvider } from '../domain/service-provider.js';
import { ManageableServiceProviderFilter } from '../domain/types.js';
import { ServiceProviderMerkmalEntity } from './service-provider-merkmal.entity.js';
import { ServiceProviderRollenartWhitelistEntity } from './service-provider-rollenart-whitelist.entity.js';
import { ServiceProviderEntity } from './service-provider.entity.js';

/**
 * @deprecated Not for use outside of service-provider-repo, export will be removed at a later date
 */
// Disable explicit types here because it's virtually impossible to do this correctly
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function mapAggregateToData(serviceProvider: ServiceProvider<boolean>) {
    // eslint-disable-next-line @typescript-eslint/typedef
    const merkmale = serviceProvider.merkmale.map((merkmal: ServiceProviderMerkmal) => ({
        serviceProvider: serviceProvider.id,
        merkmal,
    }));

    // eslint-disable-next-line @typescript-eslint/typedef
    const rollenartenWhitelist = serviceProvider.rollenartenWhitelist.map((rollenart: RollenArt) => ({
        serviceProvider: serviceProvider.id,
        rollenart,
    }));

    return {
        // Don't assign createdAt and updatedAt, they are auto-generated!
        id: serviceProvider.id,
        name: serviceProvider.name,
        target: serviceProvider.target,
        url: serviceProvider.url,
        kategorie: serviceProvider.kategorie,
        providedOnSchulstrukturknoten: serviceProvider.providedOnSchulstrukturknoten,
        logoId: serviceProvider.logoId,
        logo: serviceProvider.logo,
        logoMimeType: serviceProvider.logoMimeType,
        keycloakGroup: serviceProvider.keycloakGroup,
        keycloakRole: serviceProvider.keycloakRole,
        externalSystem: serviceProvider.externalSystem,
        requires2fa: serviceProvider.requires2fa,
        vidisAngebotId: serviceProvider.vidisAngebotId,
        merkmale,
        rollenartenWhitelist,
    };
}

function mapEntityToAggregate(entity: ServiceProviderEntity): ServiceProvider<boolean> {
    const merkmale: ServiceProviderMerkmal[] = entity.merkmale.map(
        (merkmalEntity: ServiceProviderMerkmalEntity) => merkmalEntity.merkmal,
    );
    const rollenartenWhitelist: RollenArt[] = entity.rollenartenWhitelist.map(
        (rollenartWhitelistEntity: ServiceProviderRollenartWhitelistEntity) => rollenartWhitelistEntity.rollenart,
    );

    return ServiceProvider.construct(
        entity.id,
        entity.createdAt,
        entity.updatedAt,
        entity.name,
        entity.target,
        entity.url,
        entity.kategorie,
        entity.providedOnSchulstrukturknoten,
        entity.logoId,
        entity.logo,
        entity.logoMimeType,
        entity.keycloakGroup,
        entity.keycloakRole,
        entity.externalSystem,
        entity.requires2fa,
        entity.vidisAngebotId,
        merkmale,
        rollenartenWhitelist,
    );
}

type ServiceProviderFindOptions = {
    withLogo?: boolean;
};

type SPWithMerkmale = Loaded<ServiceProviderEntity, 'merkmale' | 'rollenartenWhitelist'>;

export enum ServiceProviderPropertyPermissions {
    ALL,
    EINGESCHRAENKT,
}

@Injectable()
export class ServiceProviderRepo {
    public constructor(private readonly em: EntityManager) {}

    public async findById(id: string, options?: ServiceProviderFindOptions): Promise<Option<ServiceProvider<true>>> {
        const exclude: readonly ['logo'] | undefined = options?.withLogo ? undefined : ['logo'];

        const serviceProvider: Option<ServiceProviderEntity> = await this.em.findOne(
            ServiceProviderEntity,
            { id },
            { exclude, populate: ['merkmale', 'rollenartenWhitelist'] },
        );

        return serviceProvider && mapEntityToAggregate(serviceProvider);
    }

    public async findByName(name: string): Promise<Option<ServiceProvider<true>>> {
        const serviceProvider: Option<ServiceProviderEntity> = await this.em.findOne(
            ServiceProviderEntity,
            {
                name: name,
            },
            { populate: ['merkmale', 'rollenartenWhitelist'] },
        );
        if (serviceProvider) {
            return mapEntityToAggregate(serviceProvider);
        }

        return null;
    }

    public async findByVidisAngebotId(vidisAngebotId: string): Promise<Option<ServiceProvider<true>>> {
        const serviceProvider: Option<ServiceProviderEntity> = await this.em.findOne(
            ServiceProviderEntity,
            {
                vidisAngebotId: vidisAngebotId,
            },
            { populate: ['merkmale', 'rollenartenWhitelist'] },
        );
        if (serviceProvider) {
            return mapEntityToAggregate(serviceProvider);
        }

        return null;
    }

    public async findVidisAngeboteforSchools(
        organisationIds: OrganisationID[],
        options?: ServiceProviderFindOptions,
    ): Promise<ServiceProvider<true>[]> {
        if (organisationIds.length === 0) {
            return [];
        }

        const exclude: readonly ['logo'] | undefined = options?.withLogo ? undefined : ['logo'];

        const serviceProviders: ServiceProviderEntity[] = await this.em.find(
            ServiceProviderEntity,
            {
                providedOnSchulstrukturknoten: { $in: organisationIds },
                vidisAngebotId: { $ne: null },
            },
            {
                exclude,
                populate: ['merkmale', 'rollenartenWhitelist'],
            },
        );

        return serviceProviders.map(mapEntityToAggregate);
    }

    public async findNonSchoolProvidedVidisAngebote(): Promise<ServiceProvider<true>[]> {
        const schoolOrganisationIds: Subquery = this.em
            .createQueryBuilder(OrganisationEntity, 'organisation')
            .select('id')
            .where({ typ: OrganisationsTyp.SCHULE });

        const serviceProviders: ServiceProviderEntity[] = await this.em.find(
            ServiceProviderEntity,
            {
                providedOnSchulstrukturknoten: { $nin: schoolOrganisationIds },
                vidisAngebotId: { $ne: null },
            },
            {
                exclude: ['logo'] as const,
                populate: ['merkmale', 'rollenartenWhitelist'],
            },
        );

        return serviceProviders.map(mapEntityToAggregate);
    }

    public async findByKeycloakGroup(groupname: string): Promise<ServiceProvider<true>[]> {
        const serviceProviders: ServiceProviderEntity[] = await this.em.find(
            ServiceProviderEntity,
            {
                keycloakGroup: groupname,
            },
            { populate: ['merkmale', 'rollenartenWhitelist'] },
        );
        return serviceProviders.map(mapEntityToAggregate);
    }

    public async find(options?: ServiceProviderFindOptions): Promise<ServiceProvider<true>[]> {
        const exclude: readonly ['logo'] | undefined = options?.withLogo ? undefined : ['logo'];

        const serviceProviders: ServiceProviderEntity[] = await this.em.findAll(ServiceProviderEntity, {
            exclude,
            populate: ['merkmale', 'rollenartenWhitelist'],
        });

        return serviceProviders.map(mapEntityToAggregate);
    }

    public async findByIds(ids: string[]): Promise<Map<string, ServiceProvider<true>>> {
        const serviceProviderEntities: ServiceProviderEntity[] = await this.em.find(
            ServiceProviderEntity,
            { id: { $in: ids } },
            {
                populate: ['merkmale', 'rollenartenWhitelist'],
            },
        );

        const serviceProviderMap: Map<string, ServiceProvider<true>> = new Map();
        serviceProviderEntities.forEach((serviceProviderEntity: ServiceProviderEntity) => {
            const serviceProvider: ServiceProvider<true> = mapEntityToAggregate(serviceProviderEntity);
            serviceProviderMap.set(serviceProviderEntity.id, serviceProvider);
        });

        return serviceProviderMap;
    }

    public async findByOrganisationsWithMerkmale(
        orgaIds: OrganisationID[] | 'all',
        filter?: ManageableServiceProviderFilter,
    ): Promise<Counted<ServiceProvider<true>>> {
        const where: FilterQuery<ServiceProviderEntity> = {};

        if (orgaIds !== 'all') {
            where.providedOnSchulstrukturknoten = { $in: orgaIds };
        }

        if (filter?.kategorien && filter.kategorien.length > 0) {
            where.kategorie = { $in: filter.kategorien };
        }

        if (filter?.searchFilter) {
            const escapedSearchFilter: string = filter.searchFilter.replace(/[\\%_]/g, '\\$&');
            where.name = { $ilike: `%${escapedSearchFilter}%` };
        }

        const [entities, count]: Counted<ServiceProviderEntity> = await this.em.findAndCount(
            ServiceProviderEntity,
            where,
            {
                populate: ['merkmale', 'rollenartenWhitelist'],
                limit: filter?.limit,
                offset: filter?.offset,
                orderBy: { kategorie: 'ASC', name: 'ASC', id: 'ASC' },
            },
        );

        const serviceProviders: ServiceProvider<true>[] = entities.map(mapEntityToAggregate);
        return [serviceProviders, count];
    }

    public async findByIdForOrganisationIds(
        id: ServiceProviderID,
        organisationIds: OrganisationID[],
    ): Promise<Option<ServiceProvider<true>>> {
        const entity: SPWithMerkmale | null = await this.em.findOne(
            ServiceProviderEntity,
            {
                id,
                providedOnSchulstrukturknoten: { $in: organisationIds },
            },
            {
                populate: ['merkmale', 'rollenartenWhitelist'],
            },
        );

        if (!entity) {
            return null;
        }

        return mapEntityToAggregate(entity);
    }

    public async findByOrgasWithMerkmal(
        organisationIds: OrganisationID[],
        merkmal: ServiceProviderMerkmal,
        limit?: number,
        offset?: number,
    ): Promise<Counted<ServiceProvider<true>>> {
        const [entities, count]: Counted<ServiceProviderEntity> = await this.em.findAndCount(
            ServiceProviderEntity,
            {
                providedOnSchulstrukturknoten: { $in: organisationIds },
                merkmale: { merkmal: merkmal },
            },
            {
                populate: ['merkmale', 'rollenartenWhitelist'],
                limit,
                offset,
                orderBy: {
                    kategorie: 'ASC', // kategorie defines a custom order
                },
            },
        );

        return [entities.map(mapEntityToAggregate), count];
    }

    public async findAuthorizedById(
        permissions: IPersonPermissions,
        id: string,
    ): Promise<Option<ServiceProvider<true>>> {
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.ANGEBOTE_VERWALTEN, RollenSystemRecht.ROLLEN_ERWEITERN],
            true,
            false,
        );
        const entity: Option<ServiceProviderEntity> = await this.em.findOne(
            ServiceProviderEntity,
            permittedOrgas.all
                ? { id }
                : {
                      id,
                      providedOnSchulstrukturknoten: { $in: permittedOrgas.orgaIds },
                  },
            {
                populate: ['merkmale', 'rollenartenWhitelist'],
            },
        );
        return entity ? mapEntityToAggregate(entity) : entity;
    }

    public async findBySchulstrukturknoten(
        organisationIds: Array<OrganisationID>,
    ): Promise<Array<ServiceProvider<true>>> {
        const exclude: readonly ['logo'] | undefined = ['logo'];
        return (
            await this.em.find(
                ServiceProviderEntity,
                { providedOnSchulstrukturknoten: { $in: organisationIds } },
                {
                    exclude,
                },
            )
        ).map(mapEntityToAggregate);
    }

    public async findBySchulstrukturknotenPaginated(
        organisationIds: Array<OrganisationID>,
        searchQuery?: string,
        limit?: number,
        offset?: number,
    ): Promise<Counted<ServiceProvider<true>>> {
        const where: FilterQuery<ServiceProviderEntity> = {
            providedOnSchulstrukturknoten: { $in: organisationIds },
        };

        if (searchQuery) {
            const escapedPercentAndUnderscoreWildcards: string = searchQuery.replace(/[%_\\]/g, '\\$&');
            where.name = { $ilike: `%${escapedPercentAndUnderscoreWildcards}%` };
        }

        const exclude: readonly ['logo'] | undefined = ['logo'];
        const [entities, count]: Counted<ServiceProviderEntity> = await this.em.findAndCount(
            ServiceProviderEntity,
            where,
            {
                exclude,
                limit,
                offset,
                orderBy: { name: 'ASC', id: 'ASC' },
            },
        );

        return [entities.map(mapEntityToAggregate), count];
    }

    // TODO check permissions. Currently required by db-seed. Refactor once we have permissions for seeding.
    public async createUnsafe(serviceProvider: ServiceProvider<false>): Promise<ServiceProvider<true>> {
        const serviceProviderEntity: ServiceProviderEntity = this.em.create(
            ServiceProviderEntity,
            mapAggregateToData(serviceProvider),
        );

        await this.em.persist(serviceProviderEntity).flush();

        return mapEntityToAggregate(serviceProviderEntity);
    }

    public async fetchRolleServiceProvidersWithoutPerson(
        rolleId: RolleID | RolleID[],
    ): Promise<ServiceProvider<true>[]> {
        const rolleServiceProviderEntities: RolleServiceProviderEntity[] = await this.em.find(
            RolleServiceProviderEntity,
            {
                rolle: {
                    id: Array.isArray(rolleId) ? { $in: rolleId } : rolleId,
                },
            },
            {
                populate: [
                    'serviceProvider',
                    'serviceProvider.merkmale',
                    'serviceProvider.rollenartenWhitelist',
                    'rolle',
                    'rolle.personenKontexte',
                ],
            },
        );

        const serviceProviders: ServiceProvider<true>[] = rolleServiceProviderEntities.map(
            (rolleServiceProviderEntity: RolleServiceProviderEntity) => {
                return mapEntityToAggregate(rolleServiceProviderEntity.serviceProvider);
            },
        );

        return serviceProviders;
    }

    public async deleteByIdAuthorized(
        permissions: IPersonPermissions,
        serviceProviderId: ServiceProviderID,
    ): Promise<Result<void, EntityNotFoundError | MissingPermissionsError>> {
        const entity: ServiceProviderEntity | null = await this.em.findOne(
            ServiceProviderEntity,
            {
                id: serviceProviderId,
            },
            { populate: ['merkmale', 'rollenartenWhitelist'] },
        );
        if (!entity) {
            return Err(new EntityNotFoundError('ServiceProvider', serviceProviderId));
        }

        const hasPermission: Result<ServiceProviderPropertyPermissions, DomainError> =
            await this.getPermissionsForServiceProvider(permissions, mapEntityToAggregate(entity));
        if (!hasPermission.ok) {
            return Err(new MissingPermissionsError('Not authorized to delete Service Provider!'));
        }

        await this.em.remove(entity).flush();
        return Ok();
    }

    public async getPermissionsForServiceProvider(
        permissions: IPersonPermissions,
        serviceProvider: ServiceProvider<boolean>,
    ): Promise<Result<ServiceProviderPropertyPermissions, DomainError>> {
        if (
            await permissions.hasSystemrechtAtOrganisation(
                serviceProvider.providedOnSchulstrukturknoten,
                RollenSystemRecht.ANGEBOTE_VERWALTEN,
            )
        ) {
            // ANGEBOTE_VERWALTEN takes precedence over ANGEBOTE_EINGESCHRAENKT_VERWALTEN, so if the user has both we return early
            return Ok(ServiceProviderPropertyPermissions.ALL);
        }

        if (
            await permissions.hasSystemrechtAtOrganisation(
                serviceProvider.providedOnSchulstrukturknoten,
                RollenSystemRecht.ANGEBOTE_EINGESCHRAENKT_VERWALTEN,
            )
        ) {
            return Ok(ServiceProviderPropertyPermissions.EINGESCHRAENKT);
        }

        return Err(new MissingPermissionsError('Not authorized to manage Service Providers at this organisation!'));
    }
}
