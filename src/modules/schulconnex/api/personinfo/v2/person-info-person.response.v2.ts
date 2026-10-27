<<<<<<< HEAD
import { ApiProperty } from '@nestjs/swagger';
import { PersonInfoPersonNameDtoV2 } from './person-info-person-name.response.v2.js';

export class PersonInfoPersonDtoV2 {
    @ApiProperty({ nullable: true })
    public readonly stammorganisation?: object;

    @ApiProperty({ type: PersonInfoPersonNameDtoV2 })
    public readonly name: PersonInfoPersonNameDtoV2;

    public constructor(name: PersonInfoPersonNameDtoV2) {
        this.name = new PersonInfoPersonNameDtoV2(name);
=======
import { PersonInfoPersonResponseV1 } from '../v1/person-info-person.response.v1.js';
import { type PersonInfoPersonNameDtoV2 } from './person-info-person-name.response.v2.js';

export class PersonInfoPersonDtoV2 extends PersonInfoPersonResponseV1 {
    public constructor(name: PersonInfoPersonNameDtoV2) {
        super(name);
>>>>>>> cb240b12 (SPSH-4394 - Extract Schulconnex Mapping(#1346))
    }
}
