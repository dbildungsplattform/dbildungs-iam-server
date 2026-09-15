import { Ref } from '@mikro-orm/core';
import { Entity, Enum, Index, ManyToOne, Property } from '@mikro-orm/decorators/legacy';
import { TimestampedEntity } from '../../../persistence/timestamped.entity.js';
import { PersonEntity } from '../../person/persistence/person.entity.js';
import { EmailAddressStatus } from '../domain/email-address.js';

@Entity({ tableName: 'email_address' })
export class EmailAddressEntity extends TimestampedEntity {
    @ManyToOne({
        columnType: 'uuid',
        fieldName: 'person_id',
        ref: true,
        nullable: false,
        deleteRule: 'set null',
        updateRule: 'cascade',
        eager: true,
        entity: () => PersonEntity,
    })
    @Index({
        name: 'email_address_person_id_index',
    })
    public personId?: Ref<PersonEntity>;

    @Property({ primary: true, nullable: false, unique: true })
    public address!: string;

    @Property({ nullable: false })
    public oxUserId?: string;

    @Enum({ items: () => EmailAddressStatus, nativeEnumName: 'email_address_status_enum' })
    public status!: EmailAddressStatus;
}
