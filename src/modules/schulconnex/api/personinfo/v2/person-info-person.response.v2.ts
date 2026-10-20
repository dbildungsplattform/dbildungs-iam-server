import { PersonInfoPersonResponseV1 } from '../v1/person-info-person.response.v1.js';
import { type PersonInfoPersonNameResponseV2 } from './person-info-person-name.response.v2.js';

export class PersonInfoPersonResponseV2 extends PersonInfoPersonResponseV1 {
    public constructor(name: PersonInfoPersonNameResponseV2) {
        super(name);
    }
}
