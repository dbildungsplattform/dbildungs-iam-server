import { type Person } from '../../../../person/domain/person.js';
import { PersonInfoPersonResponseV1 } from '../v1/person-info-person.response.v1.js';

export class PersonInfoPersonResponseV2 extends PersonInfoPersonResponseV1 {
    public static override createNew(person: Person<true>): PersonInfoPersonResponseV2 {
        return new PersonInfoPersonResponseV2({
            vorname: person.vorname,
            familiennamen: person.familienname,
        });
    }
}
