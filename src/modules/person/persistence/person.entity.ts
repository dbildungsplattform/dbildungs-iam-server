import { Collection, DateTimeType, QueryOrder, quote, SchemaTable } from '@mikro-orm/core';
import { Entity, Index, ManyToOne, OneToMany, Property } from '@mikro-orm/decorators/legacy';
import { DataProviderEntity } from '../../../persistence/data-provider.entity.js';
import { TimestampedEntity } from '../../../persistence/timestamped.entity.js';
import { EmailAddressEntity } from '../../email/persistence/email-address.entity.js';
import { UserLockEntity } from '../../keycloak-administration/entity/user-lock.entity.js';
import { PersonenkontextEntity } from '../../personenkontext/persistence/personenkontext.entity.js';
import { PersonExternalIdMappingEntity } from './external-id-mappings.entity.js';

@Entity({ tableName: 'person' })
export class PersonEntity extends TimestampedEntity {
    /**
     * @deprecated This constructor is for automapper only.
     */
    public constructor() {
        super();
    }

    @Index({
        name: 'person_keycloak_user_id_unique',
        expression:
            'create unique index "person_keycloak_user_id_unique" on "person" ("keycloak_user_id") nulls not distinct;',
    })
    @Property()
    public keycloakUserId!: string;

    @Index({
        name: 'person_referrer_trgm_index',
        expression: (columns: Record<keyof PersonEntity, string>, table: SchemaTable, name: string) =>
            quote`create index ${name} on ${table} using gin (${columns.username} gin_trgm_ops);`,
    })
    @Index({
        name: 'person_username_unique',
        expression: (columns: Record<keyof PersonEntity, string>, table: SchemaTable, name: string) =>
            quote`create unique index ${name} on ${table} (${columns.username}) nulls distinct;`,
    })
    @Property({ nullable: false })
    public username?: string;

    @Property()
    public mandant!: string;

    @Property({ nullable: false })
    public readonly stammorganisation?: string;

    @Index({
        name: 'person_familienname_trgm_index',
        expression:
            'create index "person_familienname_trgm_index" on "person" using gin ("familienname" gin_trgm_ops);',
    })
    @Property()
    public familienname!: string;

    @Index({
        name: 'person_vorname_trgm_index',
        expression: (columns: Record<keyof PersonEntity, string>, table: SchemaTable, name: string) =>
            quote`create index ${name} on ${table} using gin (${columns.vorname} gin_trgm_ops);`,
    })
    @Property()
    public vorname!: string;

    @ManyToOne({ nullable: false, deleteRule: 'set null', updateRule: 'cascade' })
    public dataProvider?: DataProviderEntity;

    @Property({ nullable: false, default: '1' })
    public revision!: string;

    @Index({
        name: 'person_personalnummer_unique',
        expression: (columns: Record<keyof PersonEntity, string>, table: SchemaTable, name: string) =>
            quote`create unique index ${name} on ${table} (${columns.personalnummer}) nulls distinct;`,
    })
    @Index({
        name: 'person_personalnummer_trgm_index',
        expression: (columns: Record<keyof PersonEntity, string>, table: SchemaTable, name: string) =>
            quote`create index ${name} on ${table} using gin (${columns.personalnummer} gin_trgm_ops);`,
    })
    @Property({ nullable: false })
    public personalnummer?: string;

    @OneToMany({
        entity: () => PersonenkontextEntity,
        mappedBy: 'personId',
    })
    public personenKontexte: Collection<PersonenkontextEntity> = new Collection<PersonenkontextEntity>(this);

    @OneToMany({
        entity: () => EmailAddressEntity,
        mappedBy: 'personId',
        cascade: [],
        orphanRemoval: false,
        eager: true,
        orderBy: { updatedAt: QueryOrder.desc },
    })
    public emailAddresses: Collection<EmailAddressEntity> = new Collection<EmailAddressEntity>(this);

    @Property({ nullable: false, type: DateTimeType })
    public orgUnassignmentDate?: Date;

    @OneToMany({
        entity: () => UserLockEntity,
        mappedBy: 'person',
    })
    public userLocks: Collection<UserLockEntity> = new Collection<UserLockEntity>(this);

    @Property({ nullable: false, default: false })
    public istTechnisch!: boolean;

    @OneToMany({
        entity: () => PersonExternalIdMappingEntity,
        mappedBy: 'person',
        orphanRemoval: true,
        eager: true, // Always populate this relation
    })
    public externalIds: Collection<PersonExternalIdMappingEntity> = new Collection<PersonExternalIdMappingEntity>(this);
}
