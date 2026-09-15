import { Rel } from '@mikro-orm/core';
import { Entity, ManyToOne, Property, Unique } from '@mikro-orm/decorators/legacy';
import { TimestampedEntity } from '../../../persistence/timestamped.entity.js';
import { PersonLockOccasion } from '../../person/domain/person.enums.js';
import { PersonEntity } from '../../person/persistence/person.entity.js';

@Entity({ tableName: 'user_lock' })
@Unique({ properties: ['person', 'locked_occasion'] })
export class UserLockEntity extends TimestampedEntity {
    @ManyToOne({
        entity: () => PersonEntity,
        fieldName: 'person_id',
        columnType: 'uuid',
        deleteRule: 'cascade',
        updateRule: 'cascade',
        ref: true,
        nullable: false,
    })
    public readonly person!: Rel<PersonEntity>;

    @Property({ nullable: false })
    public locked_by!: string;

    @Property({ nullable: false })
    public locked_until?: Date;

    @Property({ nullable: false, type: 'string' })
    public locked_occasion!: PersonLockOccasion;
}
