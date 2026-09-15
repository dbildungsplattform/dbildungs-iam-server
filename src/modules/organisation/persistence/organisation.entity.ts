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
    @Property({ columnType: 'uuid', nullable: false })
    public administriertVon?: string;

    @Property({ columnType: 'uuid', nullable: false })
    public zugehoerigZu?: string;

    @Property({ nullable: false })
    public kennung?: string;

    @Property({ nullable: false })
    public name?: string;

    @Property({ nullable: false })
    public namensergaenzung?: string;

    @Property({ nullable: false })
    public kuerzel?: string;

    @Index({ name: 'organisation_typ_index' })
    @Enum({ items: () => OrganisationsTyp, nullable: false, nativeEnumName: 'organisations_typ_enum' })
    public typ?: OrganisationsTyp;

    @Enum({ items: () => Traegerschaft, nullable: false, nativeEnumName: 'traegerschaft_enum' })
    public traegerschaft?: Traegerschaft;

    @Property({ nullable: false })
    public emailDomain?: string;

    @Property({ nullable: false })
    public emailAddress?: string;

    @Property({ default: false })
    public itslearningEnabled!: boolean;

    @Property({ type: new BigIntType('number'), defaultRaw: '1', concurrencyCheck: true })
    public version!: number & Opt;
}
