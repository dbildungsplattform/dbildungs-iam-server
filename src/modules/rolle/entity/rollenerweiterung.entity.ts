import { Ref } from '@mikro-orm/core';
import { Entity, Index, ManyToOne, Unique } from '@mikro-orm/decorators/legacy';
import { TimestampedEntity } from '../../../persistence/timestamped.entity.js';
import { OrganisationEntity } from '../../organisation/persistence/organisation.entity.js';
import { ServiceProviderEntity } from '../../service-provider/repo/service-provider.entity.js';
import { RolleEntity } from './rolle.entity.js';

// DB-level following FK rules (see migrations) findings:
// - rolle_id: ON DELETE CASCADE. Deleting a Rolle removes its extensions silently, without ORM hooks or events.
// - organisation_id, service_provider_id: NO ACTION. Deleting such an organisation or service provider fails while extensions reference it.
@Entity({ tableName: 'rollenerweiterung' })
@Unique({
    // Weird name to avoid recreation of index, MikroORM7 was trying to generate a different name
    name: 'rollenerweiterung_organisation_id_rolle_id_service_8581c_unique',
    properties: ['organisationId', 'rolleId', 'serviceProviderId'],
})
export class RollenerweiterungEntity extends TimestampedEntity {
    @ManyToOne({
        fieldName: 'organisation_id',
        entity: () => OrganisationEntity,
        deleteRule: 'no action',
        updateRule: 'cascade',
    })
    @Index({ name: 'rolle_erweiterung_organisation_id_index', type: 'hash' })
    public organisationId!: Ref<OrganisationEntity>;

    @ManyToOne({ fieldName: 'rolle_id', entity: () => RolleEntity, deleteRule: 'cascade', updateRule: 'cascade' })
    @Index({ name: 'rolle_erweiterung_rolle_id_index', type: 'hash' })
    public rolleId!: Ref<RolleEntity>;

    @ManyToOne({
        fieldName: 'service_provider_id',
        entity: () => ServiceProviderEntity,
        deleteRule: 'no action',
        updateRule: 'cascade',
    })
    @Index({ name: 'rolle_erweiterung_service_provider_id_index', type: 'hash' })
    public serviceProviderId!: Ref<ServiceProviderEntity>;
}
