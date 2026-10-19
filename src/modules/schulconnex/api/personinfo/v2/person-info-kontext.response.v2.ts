import { ApiProperty } from '@nestjs/swagger';
import { SchulconnexPersonenstatus, SchulconnexRolle } from '../../schulconnex-enums.js';
import { PersonenInfoKontextOrganisationResponseV2 } from './person-info-kontext-organisation.response.v2.js';
import { PersonInfoKontextErreichbarkeitResponseV2 } from './person-info-kontext-erreichbarkeit.response.v2.js';
import { PersonenInfoKontextGruppeResponseV2 } from './person-info-kontext-gruppe.response.v2.js';

export class PersonInfoKontextResponseV2 {
    @ApiProperty()
    public id: string;

    @ApiProperty({ type: PersonenInfoKontextOrganisationResponseV2 })
    public organisation: PersonenInfoKontextOrganisationResponseV2;

    @ApiProperty({ enum: SchulconnexRolle })
    public rolle: SchulconnexRolle;

    @ApiProperty({ type: [PersonInfoKontextErreichbarkeitResponseV2] })
    public erreichbarkeiten: PersonInfoKontextErreichbarkeitResponseV2[];

    @ApiProperty({ enum: SchulconnexPersonenstatus, nullable: true })
    public personenstatus?: SchulconnexPersonenstatus;

    @ApiProperty({ type: [PersonenInfoKontextGruppeResponseV2] })
    public readonly gruppen: PersonenInfoKontextGruppeResponseV2[];

    public constructor(props: Readonly<PersonInfoKontextResponseV2>) {
        this.id = props.id;
        this.organisation = props.organisation;
        this.rolle = props.rolle;
        this.erreichbarkeiten = props.erreichbarkeiten;
        this.personenstatus = props.personenstatus;
        this.gruppen = props.gruppen;
    }
}
