import { BaseEntity, DateTimeType } from '@mikro-orm/core';
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'crypto';

@Entity({ tableName: 'event_outbox' })
@Index({ name: 'event_outbox_unpublished_index', properties: ['publishedAt', 'createdAt'] })
export class EventOutboxEntity extends BaseEntity {
    @PrimaryKey({ columnType: 'uuid', onCreate: () => randomUUID() })
    public readonly id!: string;

    @Property({ type: 'string', length: 255 })
    public eventKey!: string;

    @Property({ type: 'string', length: 255, nullable: true })
    public kafkaKey!: string | null;

    @Property({ type: 'text' })
    public payload!: string;

    @Property({ type: DateTimeType, onCreate: () => new Date() })
    public createdAt!: Date;

    @Property({ type: DateTimeType, nullable: true })
    public publishedAt!: Date | null;

    @Property({ type: 'integer', default: 0 })
    public attempts!: number;

    @Property({ type: 'text', nullable: true })
    public lastError!: string | null;
}
