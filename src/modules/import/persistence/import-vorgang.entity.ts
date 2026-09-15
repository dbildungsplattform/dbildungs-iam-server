import { Opt, Ref } from '@mikro-orm/core';
import { Entity, Enum, ManyToOne, Property } from '@mikro-orm/decorators/legacy';
import { TimestampedEntity } from '../../../persistence/timestamped.entity.js';
import { OrganisationEntity } from '../../organisation/persistence/organisation.entity.js';
import { PersonEntity } from '../../person/persistence/person.entity.js';
import { RolleEntity } from '../../rolle/entity/rolle.entity.js';
import { ImportStatus } from '../domain/import.enums.js';

@Entity({ tableName: 'importvorgang' })
export class ImportVorgangEntity extends TimestampedEntity {
    @ManyToOne({
        fieldName: 'person_id',
        columnType: 'uuid',
        deleteRule: 'set null',
        updateRule: 'cascade',
        ref: true,
        nullable: false,
        entity: () => PersonEntity,
    })
    public readonly importByPersonId?: Ref<PersonEntity>;

    @Property()
    public readonly importByUsername!: string;

    @ManyToOne({
        fieldName: 'rolle_id',
        columnType: 'uuid',
        deleteRule: 'set null',
        updateRule: 'cascade',
        ref: true,
        nullable: false,
        entity: () => RolleEntity,
    })
    public readonly rolleId?: Ref<RolleEntity>;

    @Property()
    public rollename!: string;

    @ManyToOne({
        fieldName: 'organisation_id',
        columnType: 'uuid',
        deleteRule: 'set null',
        updateRule: 'cascade',
        ref: true,
        nullable: false,
        entity: () => OrganisationEntity,
    })
    public readonly organisationId?: Ref<OrganisationEntity>;

    @Property()
    public organisationsname!: string;

    @Property({ type: 'int' })
    public dataItemCount!: number;

    @Enum({
        items: () => ImportStatus,
        nativeEnumName: 'import_status_enum',
        onCreate: () => ImportStatus.STARTED,
    })
    public status!: ImportStatus & Opt;
}
