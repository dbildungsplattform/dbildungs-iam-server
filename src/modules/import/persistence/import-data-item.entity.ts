import { TimestampedEntity } from '../../../persistence/timestamped.entity.js';
import { ArrayType, Ref } from '@mikro-orm/core';
import { ImportVorgangEntity } from './import-vorgang.entity.js';
import { ImportDataItemStatus } from '../domain/importDataItem.enum.js';
import { Entity, Enum, ManyToOne, Property } from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'importdataitem' })
export class ImportDataItemEntity extends TimestampedEntity {
    @ManyToOne({
        fieldName: 'importvorgang_id',
        columnType: 'uuid',
        deleteRule: 'no action',
        updateRule: 'cascade',
        ref: true,
        nullable: false,
        entity: () => ImportVorgangEntity,
    })
    public readonly importvorgangId!: Ref<ImportVorgangEntity>;

    @Property()
    public readonly nachname!: string;

    @Property()
    public readonly vorname!: string;

    @Property({ nullable: false })
    public readonly klasse?: string;

    @Property({ nullable: false })
    public personalnummer?: string;

    @Property({ type: ArrayType, nullable: false })
    public validationErrors?: string[];

    @Property({ nullable: false, length: 50 })
    public username?: string;

    @Property({ nullable: false })
    public password?: string;

    @Enum({
        items: () => ImportDataItemStatus,
        nativeEnumName: 'import_data_item_status_enum',
    })
    public status: ImportDataItemStatus = ImportDataItemStatus.PENDING;
}
