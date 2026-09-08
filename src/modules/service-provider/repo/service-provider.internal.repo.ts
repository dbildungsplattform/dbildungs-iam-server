import { EntityManager, sql } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ServiceProviderEntity } from './service-provider.entity.js';
import { OrganisationID, ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { ServiceProvider } from '../domain/service-provider.js';
import { mapAggregateToData, mapEntityToAggregate } from './service-provider-entity-mapper.js';

@Injectable()
export class ServiceProviderInternalRepo {
    public constructor(private readonly em: EntityManager) {}

    public async existsDuplicateNameForOrganisation(
        name: string,
        organisationId: OrganisationID,
        ignoreSpId: Option<ServiceProviderID>,
    ): Promise<boolean> {
        const serviceProvider: Option<ServiceProviderEntity> = await this.em.findOne(ServiceProviderEntity, {
            providedOnSchulstrukturknoten: organisationId,
            [sql.upper('name')]: name.toUpperCase(),
            id: {
                $ne: ignoreSpId,
            },
        });
        return !!serviceProvider;
    }

    public async persistAndFlush(serviceProvider: ServiceProvider<boolean>): Promise<ServiceProvider<true>> {
        let serviceProviderEntity: ServiceProviderEntity;
        if (serviceProvider.id === undefined) {
            serviceProviderEntity = this.em.create(ServiceProviderEntity, mapAggregateToData(serviceProvider));
        } else {
            serviceProviderEntity = await this.em.findOneOrFail(
                ServiceProviderEntity,
                { id: serviceProvider.id },
                { populate: ['merkmale', 'rollenartenWhitelist'] },
            );
            serviceProviderEntity.assign(mapAggregateToData(serviceProvider));
        }

        await this.em.persist(serviceProviderEntity).flush();

        return mapEntityToAggregate(serviceProviderEntity);
    }
}
