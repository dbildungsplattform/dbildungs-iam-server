import { BaseEvent } from './base-event.js';
import { type PersonID, type PersonUsername } from '../types/index.js';

import type { Person } from '../../modules/person/domain/person.js';

export class PersonRenamedEvent extends BaseEvent {
    public constructor(
        public readonly personId: PersonID,
        public readonly vorname: string,
        public readonly familienname: string,
        public readonly username: PersonUsername | undefined,
        public readonly oldVorname: string,
        public readonly oldFamilienname: string,
        public readonly oldUsername: PersonUsername,
    ) {
        super();
    }

    public static fromPerson(
        person: Person<true>,
        oldUsername: PersonUsername,
        oldVorname: string,
        oldFamilienname: string,
    ): PersonRenamedEvent {
        return new PersonRenamedEvent(
            person.id,
            person.vorname,
            person.familienname,
            person.username,
            oldVorname,
            oldFamilienname,
            oldUsername,
        );
    }
}
