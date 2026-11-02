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
