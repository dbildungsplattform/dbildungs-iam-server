import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type Person } from '../../../modules/person/domain/person.js';
import { KafkaLdapSyncFailedEvent } from './kafka-ldap-sync-failed.event.js';

describe('KafkaLdapSyncFailedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const person: Person<true> = DoFactory.createPerson(true);

        const event: KafkaLdapSyncFailedEvent = new KafkaLdapSyncFailedEvent(person.id, person.username!);

        expect(event).toBeInstanceOf(KafkaLdapSyncFailedEvent);
        expect(event.kafkaKey).toBe(person.id);
    });
});
