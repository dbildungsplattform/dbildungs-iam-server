import { PersonInfoPersonResponseV1 } from '../v1/person-info-person.response.v1.js';
import { type PersonInfoPersonNameDtoV2 } from './person-info-person-name.response.v2.js';

export class PersonInfoPersonDtoV2 extends PersonInfoPersonResponseV1 {
    public constructor(name: PersonInfoPersonNameDtoV2) {
        super(name);
    }
}
