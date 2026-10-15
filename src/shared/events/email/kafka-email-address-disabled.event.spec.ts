import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type Person } from '../../../modules/person/domain/person.js';
import { KafkaEmailAddressDisabledEvent } from './kafka-email-address-disabled.event.js';

describe('KafkaEmailAddressDisabledEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const person: Person<true> = DoFactory.createPerson(true);

        const event: KafkaEmailAddressDisabledEvent = new KafkaEmailAddressDisabledEvent(person.id, person.username!);

        expect(event).toBeInstanceOf(KafkaEmailAddressDisabledEvent);
        expect(event.kafkaKey).toBe(person.id);
    });
});
