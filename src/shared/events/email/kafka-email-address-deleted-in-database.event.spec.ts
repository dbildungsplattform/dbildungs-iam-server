import { faker } from '@faker-js/faker';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { EmailAddressStatus } from '../../../modules/email/domain/email-address.js';
import { type Person } from '../../../modules/person/domain/person.js';
import { KafkaEmailAddressDeletedInDatabaseEvent } from './kafka-email-address-deleted-in-database.event.js';

describe('KafkaEmailAddressDeletedInDatabaseEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const person: Person<true> = DoFactory.createPerson(true);
        const oxUserId: string = faker.string.uuid();
        const emailAddressId: string = faker.string.uuid();
        const status: EmailAddressStatus = faker.helpers.enumValue(EmailAddressStatus);
        const address: string = faker.internet.email();

        const event: KafkaEmailAddressDeletedInDatabaseEvent = new KafkaEmailAddressDeletedInDatabaseEvent(
            person.id,
            oxUserId,
            emailAddressId,
            status,
            address,
        );

        expect(event).toBeInstanceOf(KafkaEmailAddressDeletedInDatabaseEvent);
        expect(event.kafkaKey).toBe(person.id);
    });
});
