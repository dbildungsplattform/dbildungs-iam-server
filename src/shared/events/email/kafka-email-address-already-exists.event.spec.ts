import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type Organisation } from '../../../modules/organisation/domain/organisation.js';
import { type Person } from '../../../modules/person/domain/person.js';
import { KafkaEmailAddressAlreadyExistsEvent } from './kafka-email-address-already-exists.event.js';

describe('KafkaEmailAddressAlreadyExistsEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const person: Person<true> = DoFactory.createPerson(true);
        const orga: Organisation<true> = DoFactory.createOrganisation(true);

        const event: KafkaEmailAddressAlreadyExistsEvent = new KafkaEmailAddressAlreadyExistsEvent(
            person.id,
            orga.kennung!,
        );

        expect(event).toBeInstanceOf(KafkaEmailAddressAlreadyExistsEvent);
        expect(event.kafkaKey).toBe(person.id);
    });
});
