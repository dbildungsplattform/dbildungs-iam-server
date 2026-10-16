import { type KafkaEvent } from './kafka-event.js';
import { PersonenkontextUpdatedEvent } from './personenkontext-updated.event.js';
import { type Person } from '../../modules/person/domain/person.js';
import { type Personenkontext } from '../../modules/personenkontext/domain/personenkontext.js';
import { type Organisation } from '../../modules/organisation/domain/organisation.js';
import { type Rolle } from '../../modules/rolle/domain/rolle.js';

export class KafkaPersonenkontextUpdatedEvent extends PersonenkontextUpdatedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.person.id;
    }

    public static override fromPersonenkontexte(
        person: Person<true>,
        newKontexte: [Personenkontext<true>, Organisation<true>, Rolle<true>][],
        removedKontexte: [Personenkontext<true>, Organisation<true>, Rolle<true>][],
        currentKontexte: [Personenkontext<true>, Organisation<true>, Rolle<true>][],
        email?: string,
    ): KafkaPersonenkontextUpdatedEvent {
        const event: PersonenkontextUpdatedEvent = PersonenkontextUpdatedEvent.fromPersonenkontexte(
            person,
            newKontexte,
            removedKontexte,
            currentKontexte,
            email,
        );
        return new KafkaPersonenkontextUpdatedEvent(
            event.person,
            event.newKontexte,
            event.removedKontexte,
            event.currentKontexte,
        );
    }
}
