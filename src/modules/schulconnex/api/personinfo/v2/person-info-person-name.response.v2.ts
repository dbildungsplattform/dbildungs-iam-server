<<<<<<< HEAD
import { ApiProperty } from '@nestjs/swagger';

export class PersonInfoPersonNameDtoV2 {
    @ApiProperty({ deprecated: true, description: 'Deprecated, use `familienname` instead.' })
    public readonly familiennamen: string;

    @ApiProperty()
    public readonly familienname: string;

    @ApiProperty()
    public readonly vorname: string;

    public constructor(props: Readonly<PersonInfoPersonNameDtoV2>) {
        this.familiennamen = props.familiennamen;
        this.familienname = props.familienname;
        this.vorname = props.vorname;
    }
}
=======
import { PersonInfoPersonNameResponseV1 } from '../v1/person-info-person-name.response.v1.js';

export class PersonInfoPersonNameDtoV2 extends PersonInfoPersonNameResponseV1 {}
>>>>>>> cb240b12 (SPSH-4394 - Extract Schulconnex Mapping(#1346))
