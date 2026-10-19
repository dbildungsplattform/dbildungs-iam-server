import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type Person } from '../../../modules/person/domain/person.js';
import { KafkaLdapEntryDeletedEvent } from './kafka-ldap-entry-deleted.event.js';

describe('KafkaLdapEntryDeletedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const person: Person<true> = DoFactory.createPerson(true);

        const event: KafkaLdapEntryDeletedEvent = new KafkaLdapEntryDeletedEvent(person.id, person.username!);

        expect(event).toBeInstanceOf(KafkaLdapEntryDeletedEvent);
        expect(event.kafkaKey).toBe(person.id);
    });
});
