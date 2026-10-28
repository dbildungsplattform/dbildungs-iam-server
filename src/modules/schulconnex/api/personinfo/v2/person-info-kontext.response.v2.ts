import { ApiProperty } from '@nestjs/swagger';
import { SchulconnexPersonenstatus, SchulconnexRolle } from '../../schulconnex-enums.js';
import { PersonenInfoKontextOrganisationDtoV2 } from './person-info-kontext-organisation.response.v2.js';
import { PersonInfoKontextErreichbarkeitDtoV2 } from './person-info-kontext-erreichbarkeit.response.v2.js';
import { PersonenInfoKontextGruppeDtoV2 } from './person-info-kontext-gruppe.response.v2.js';

export class PersonInfoKontextDtoV2 {
    @ApiProperty()
    public id: string;

    @ApiProperty({ type: PersonenInfoKontextOrganisationDtoV2 })
    public organisation: PersonenInfoKontextOrganisationDtoV2;

    @ApiProperty({ enum: SchulconnexRolle })
    public rolle: SchulconnexRolle;

    @ApiProperty({ type: [PersonInfoKontextErreichbarkeitDtoV2] })
    public erreichbarkeiten: PersonInfoKontextErreichbarkeitDtoV2[];

    @ApiProperty({ enum: SchulconnexPersonenstatus, nullable: true })
    public personenstatus?: SchulconnexPersonenstatus;

    @ApiProperty({ type: [PersonenInfoKontextGruppeDtoV2] })
    public readonly gruppen: PersonenInfoKontextGruppeDtoV2[];

    public constructor(props: Readonly<PersonInfoKontextDtoV2>) {
        this.id = props.id;
        this.organisation = props.organisation;
        this.rolle = props.rolle;
        this.erreichbarkeiten = props.erreichbarkeiten;
        this.personenstatus = props.personenstatus;
        this.gruppen = props.gruppen;
    }
}
