import { ApiProperty } from '@nestjs/swagger';
import { PersonInfoKontextDtoV2 } from './person-info-kontext.response.v2.js';
import { PersonInfoPersonDtoV2 } from './person-info-person.response.v2.js';

export class PersonInfoDtoV2 {
    @ApiProperty()
    public readonly pid: string;

    @ApiProperty()
    public readonly person: PersonInfoPersonDtoV2;

    @ApiProperty({ type: [PersonInfoKontextDtoV2] })
    public readonly personenkontexte: PersonInfoKontextDtoV2[];

    @ApiProperty({ type: [Object] })
    public readonly beziehungen: object[];

    public constructor(pid: string, nestedPerson: PersonInfoPersonDtoV2, kontexte: PersonInfoKontextDtoV2[]) {
        this.pid = pid;
        this.person = nestedPerson;
        this.personenkontexte = kontexte;
        this.beziehungen = [];
    }
}
