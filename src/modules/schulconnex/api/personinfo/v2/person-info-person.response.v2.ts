import { ApiProperty } from '@nestjs/swagger';
import { PersonInfoPersonNameDtoV2 } from './person-info-person-name.response.v2.js';

export class PersonInfoPersonDtoV2 {
    @ApiProperty({ nullable: true })
    public readonly stammorganisation?: object;

    @ApiProperty({ type: PersonInfoPersonNameDtoV2 })
    public readonly name: PersonInfoPersonNameDtoV2;

    public constructor(name: PersonInfoPersonNameDtoV2) {
        this.name = new PersonInfoPersonNameDtoV2(name);
    }
}
