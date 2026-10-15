import { type EntityManager } from '@mikro-orm/core';
import { type ServiceProvider } from '../../src/modules/service-provider/domain/service-provider.js';
import { ServiceProviderEntity } from '../../src/modules/service-provider/repo/service-provider.entity.js';
import {
    mapEntityToAggregate,
    mapAggregateToData,
} from '../../src/modules/service-provider/repo/service-provider-entity-mapper.js';
import { DoFactory } from './do-factory.js';

export async function createAndPersistServiceProvider(
    em: EntityManager,
    serviceProviderPartial?: Partial<ServiceProvider<false>>,
): Promise<ServiceProvider<true>> {
    const serviceProvider: ServiceProvider<false> = DoFactory.createServiceProvider(false, serviceProviderPartial);

    const serviceProviderEntity: ServiceProviderEntity = em.create(
        ServiceProviderEntity,
        mapAggregateToData(serviceProvider),
    );
    await em.persist(serviceProviderEntity).flush();

    return mapEntityToAggregate(serviceProviderEntity);
}
