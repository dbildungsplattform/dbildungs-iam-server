import { type Person } from '../../modules/person/domain/person.js';
import { type PersonUsername } from '../types/aggregate-ids.types.js';
import { type KafkaEvent } from './kafka-event.js';
import { PersonRenamedEvent } from './person-renamed-event.js';

export class KafkaPersonRenamedEvent extends PersonRenamedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.personId;
    }

    public static override fromPerson(
        person: Person<true>,
        oldUsername: PersonUsername,
        oldVorname: string,
        oldFamilienname: string,
    ): KafkaPersonRenamedEvent {
        return new KafkaPersonRenamedEvent(
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
