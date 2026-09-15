import { DateTimeType, Opt, Ref } from '@mikro-orm/core';
import { Entity, Enum, Index, ManyToOne, Property, Unique } from '@mikro-orm/decorators/legacy';
import { TimestampedEntity } from '../../../persistence/timestamped.entity.js';
import { OrganisationEntity } from '../../organisation/persistence/organisation.entity.js';
import { PersonEntity } from '../../person/persistence/person.entity.js';
import { RolleEntity } from '../../rolle/entity/rolle.entity.js';
import { Jahrgangsstufe, Personenstatus, SichtfreigabeType } from '../domain/personenkontext.enums.js';

@Entity({ tableName: 'personenkontext' })
@Unique({ properties: ['personId', 'organisationId', 'rolleId'] })
export class PersonenkontextEntity extends TimestampedEntity {
    @ManyToOne({
        fieldName: 'person_id',
        columnType: 'uuid',
        deleteRule: 'cascade',
        updateRule: 'cascade',
        ref: true,
        nullable: false,
        entity: () => PersonEntity,
    })
    @Index({ name: 'personenkontext_person_id_index', type: 'hash' })
    public personId!: Ref<PersonEntity>;

    // TODO EW-636: get from access_token, see SchulConneX (Version 1.003.003.000) page 91
    @ManyToOne({
        fieldName: 'organisation_id',
        columnType: 'uuid',
        deleteRule: 'no action',
        updateRule: 'cascade',
        ref: true,
        nullable: false,
        entity: () => OrganisationEntity,
    })
    @Index({ name: 'personenkontext_organisation_id_index', type: 'hash' })
    public organisationId!: Ref<OrganisationEntity>;

    @ManyToOne({
        fieldName: 'rolle_id',
        columnType: 'uuid',
        deleteRule: 'no action',
        updateRule: 'cascade',
        ref: true,
        nullable: false,
        entity: () => RolleEntity,
    })
    @Index({ name: 'personenkontext_rolle_id_index', type: 'hash' })
    public rolleId!: Ref<RolleEntity>;

    @Property({ nullable: false })
    public username?: string;

    // TODO EW-636: mandant is related to organizations so it is not set for now. When implemented should be set to nullable: false

    @Property({ nullable: false })
    public mandant?: string;

    @Enum({ nullable: false, items: () => Personenstatus, nativeEnumName: 'personenstatus_enum' })
    public personenstatus?: Personenstatus;

    @Enum({ nullable: false, items: () => Jahrgangsstufe, nativeEnumName: 'jahrgangsstufe_enum' })
    public jahrgangsstufe?: Jahrgangsstufe;

    @Property({ nullable: false, default: SichtfreigabeType.NEIN, type: 'string' })
    public sichtfreigabe?: SichtfreigabeType;

    @Property({ nullable: false, type: DateTimeType })
    public loeschungZeitpunkt?: Date;

    @Property({ nullable: false, default: '1' })
    public revision!: string & Opt;

    @Property({ nullable: false, type: DateTimeType })
    public readonly befristung?: Date;
}
