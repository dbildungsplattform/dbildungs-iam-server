import { BigIntType, Opt } from '@mikro-orm/core';
import { Entity, Enum, Index, Property } from '@mikro-orm/decorators/legacy';
import { TimestampedEntity } from '../../../persistence/timestamped.entity.js';
import { OrganisationsTyp, Traegerschaft } from '../domain/organisation.enums.js';

@Entity({ tableName: 'organisation' })
export class OrganisationEntity extends TimestampedEntity {
    public constructor() {
        super();
    }

    @Index({ name: 'organisation_administriert_von_index' })
    @Property({ columnType: 'uuid', nullable: true })
    public administriertVon?: string;

    @Property({ columnType: 'uuid', nullable: true })
    public zugehoerigZu?: string;

    @Property({ nullable: true })
    public kennung?: string;

    @Property({ nullable: true })
    public name?: string;

    @Property({ nullable: true })
    public namensergaenzung?: string;

    @Property({ nullable: true })
    public kuerzel?: string;

    @Index({ name: 'organisation_typ_index' })
    @Enum({ items: () => OrganisationsTyp, nullable: true, nativeEnumName: 'organisations_typ_enum' })
    public typ?: OrganisationsTyp;

    @Enum({ items: () => Traegerschaft, nullable: true, nativeEnumName: 'traegerschaft_enum' })
    public traegerschaft?: Traegerschaft;

    @Property({ nullable: true })
    public uemLdapOu?: string;

    @Property({ nullable: true })
    public emailAddress?: string;

    @Property({ default: false })
    public itslearningEnabled!: boolean;

    @Property({ type: new BigIntType('number'), defaultRaw: '1', concurrencyCheck: true })
    public version!: number & Opt;
}
