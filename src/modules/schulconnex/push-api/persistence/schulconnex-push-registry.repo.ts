import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { SchulconnexPushRegistry } from '../domain/schulconnex-push-registry.js';
import { SchulconnexPushRegistryEntity } from './schulconnex-push-registry.entity.js';

function mapEntityToAggregate(entity: SchulconnexPushRegistryEntity): SchulconnexPushRegistry<true> {
    return SchulconnexPushRegistry.construct(
        entity.id,
        entity.createdAt,
        entity.updatedAt,
        entity.serviceProvider.id,
        entity.baseUrl,
    );
}

@Injectable()
export class SchulconnexPushRegistryRepo {
    public constructor(private readonly em: EntityManager) {}

    public async findById(id: string): Promise<Option<SchulconnexPushRegistry<true>>> {
        const entity: Option<SchulconnexPushRegistryEntity> = await this.em.findOne(SchulconnexPushRegistryEntity, {
            id,
        });

        return entity ? mapEntityToAggregate(entity) : null;
    }

    public async findAll(): Promise<SchulconnexPushRegistry<true>[]> {
        const entities: SchulconnexPushRegistryEntity[] = await this.em.find(SchulconnexPushRegistryEntity, {});

        return entities.map(mapEntityToAggregate);
    }
}
