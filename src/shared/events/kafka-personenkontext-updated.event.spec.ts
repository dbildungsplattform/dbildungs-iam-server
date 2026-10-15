import { KafkaPersonenkontextUpdatedEvent } from './kafka-personenkontext-updated.event.js';
import { type Person } from '../../modules/person/domain/person.js';
import { type Personenkontext } from '../../modules/personenkontext/domain/personenkontext.js';
import { type Organisation } from '../../modules/organisation/domain/organisation.js';
import { type Rolle } from '../../modules/rolle/domain/rolle.js';
import { DoFactory } from '../../../test/utils/index.js';

describe('KafkaPersonenkontextUpdatedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const person: Person<true> = DoFactory.createPerson(true);

        const newKontexte: [Personenkontext<true>, Organisation<true>, Rolle<true>][] = [] as [
            Personenkontext<true>,
            Organisation<true>,
            Rolle<true>,
        ][];
        const removedKontexte: [Personenkontext<true>, Organisation<true>, Rolle<true>][] = [] as [
            Personenkontext<true>,
            Organisation<true>,
            Rolle<true>,
        ][];
        const currentKontexte: [Personenkontext<true>, Organisation<true>, Rolle<true>][] = [] as [
            Personenkontext<true>,
            Organisation<true>,
            Rolle<true>,
        ][];

        const event: KafkaPersonenkontextUpdatedEvent = KafkaPersonenkontextUpdatedEvent.fromPersonenkontexte(
            person,
            newKontexte,
            removedKontexte,
            currentKontexte,
        );

        expect(event).toBeInstanceOf(KafkaPersonenkontextUpdatedEvent);
        expect(event.kafkaKey).toBe(person.id);
    });
});
