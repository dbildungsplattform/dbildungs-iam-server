import { Rel } from '@mikro-orm/core';
import { Entity, ManyToOne, Property } from '@mikro-orm/decorators/legacy';
import { TimestampedEntity } from '../../../../persistence/timestamped.entity.js';
import { ServiceProviderEntity } from '../../../service-provider/repo/service-provider.entity.js';

@Entity({ tableName: 'schulconnex_push_registry' })
export class SchulconnexPushRegistryEntity extends TimestampedEntity {
    @ManyToOne({
        entity: () => ServiceProviderEntity,
        fieldName: 'service_provider_id',
        columnType: 'uuid',
        deleteRule: 'cascade',
        updateRule: 'cascade',
        ref: true,
        nullable: false,
    })
    public readonly serviceProvider!: Rel<ServiceProviderEntity>;

    @Property({ type: 'text', nullable: false })
    public baseUrl!: string;

    @Property({ type: 'text', nullable: true })
    public oidcTokenEndpoint: Option<string> = null;

    @Property({ type: 'text', nullable: true })
    public oidcClientId: Option<string> = null;

    @Property({ type: 'text', nullable: true })
    public oidcClientSecretRef: Option<string> = null;
}
