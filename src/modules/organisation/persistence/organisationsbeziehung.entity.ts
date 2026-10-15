import { Entity, Enum, ManyToOne } from '@mikro-orm/decorators/legacy';
import { TimestampedEntity } from '../../../persistence/timestamped.entity.js';
import { OrganisationEntity } from './organisation.entity.js';
import { OrganisationsbeziehungsTyp } from '../domain/organisationsbeziehung-typ.enum.js';

@Entity({ tableName: 'organisationsbeziehung' })
export class OrganisationsbeziehungEntity extends TimestampedEntity {
    public constructor() {
        super();
    }

    @ManyToOne(() => OrganisationEntity, {
        mapToPk: true,
        fieldName: 'quell_organisation_id',
    })
    public quellOrganisationId!: string;

    @ManyToOne(() => OrganisationEntity, {
        mapToPk: true,
        fieldName: 'ziel_organisation_id',
    })
    public zielOrganisationId!: string;

    @Enum({
        items: () => OrganisationsbeziehungsTyp,
        nullable: false,
        nativeEnumName: 'organisationsbeziehungs_typ_enum',
    })
    public typ!: OrganisationsbeziehungsTyp;
}
