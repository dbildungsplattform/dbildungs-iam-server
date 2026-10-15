import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type Person } from '../../../modules/person/domain/person.js';
import { KafkaLdapSyncCompletedEvent } from './kafka-ldap-sync-completed.event.js';

describe('KafkaLdapSyncCompletedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const person: Person<true> = DoFactory.createPerson(true);

        const event: KafkaLdapSyncCompletedEvent = new KafkaLdapSyncCompletedEvent(person.id, person.username!);

        expect(event).toBeInstanceOf(KafkaLdapSyncCompletedEvent);
        expect(event.kafkaKey).toBe(person.id);
    });
});
