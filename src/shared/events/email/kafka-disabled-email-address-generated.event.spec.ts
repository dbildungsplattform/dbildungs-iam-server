import { faker } from '@faker-js/faker';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type Person } from '../../../modules/person/domain/person.js';
import { KafkaDisabledEmailAddressGeneratedEvent } from './kafka-disabled-email-address-generated.event.js';

describe('KafkaDisabledEmailAddressGeneratedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const person: Person<true> = DoFactory.createPerson(true);

        const event: KafkaDisabledEmailAddressGeneratedEvent = new KafkaDisabledEmailAddressGeneratedEvent(
            person.id,
            person.username!,
            faker.string.uuid(),
            faker.internet.email(),
            faker.internet.domainName(),
        );

        expect(event).toBeInstanceOf(KafkaDisabledEmailAddressGeneratedEvent);
        expect(event.kafkaKey).toBe(person.id);
    });
});
