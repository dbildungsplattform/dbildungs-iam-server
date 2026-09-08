import { BaseEntity, PrimaryKeyProp, Rel } from '@mikro-orm/core';
import { Entity, Enum, Index, ManyToOne } from '@mikro-orm/decorators/legacy';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { ServiceProviderEntity } from './service-provider.entity.js';

@Entity({ tableName: 'service_provider_rollenarten_whitelist' })
export class ServiceProviderRollenartWhitelistEntity extends BaseEntity {
    @ManyToOne({ primary: true, entity: () => ServiceProviderEntity, deleteRule: 'no action', updateRule: 'cascade' })
    @Index({
        name: 'service_provider_rollenarten_whitelist_service_provider_id_index',
    })
    public serviceProvider!: Rel<ServiceProviderEntity>;

    @Enum({ primary: true, items: () => RollenArt, nativeEnumName: 'rollen_art_enum' })
    public rollenart!: RollenArt;

    public [PrimaryKeyProp]?: ['serviceProvider', 'rollenart'];
}
