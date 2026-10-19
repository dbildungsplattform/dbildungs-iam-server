import { ApiProperty } from '@nestjs/swagger';
import { PersonInfoKontextResponseV2 } from './person-info-kontext.response.v2.js';
import { PersonInfoPersonResponseV2 } from './person-info-person.response.v2.js';

export class PersonInfoResponseV2 {
    @ApiProperty()
    public readonly pid: string;

    @ApiProperty()
    public readonly person: PersonInfoPersonResponseV2;

    @ApiProperty({ type: [PersonInfoKontextResponseV2] })
    public readonly personenkontexte: PersonInfoKontextResponseV2[];

    @ApiProperty({ type: [Object] })
    public readonly beziehungen: object[];

    public constructor(pid: string, nestedPerson: PersonInfoPersonResponseV2, kontexte: PersonInfoKontextResponseV2[]) {
        this.pid = pid;
        this.person = nestedPerson;
        this.personenkontexte = kontexte;
        this.beziehungen = [];
    }
}
