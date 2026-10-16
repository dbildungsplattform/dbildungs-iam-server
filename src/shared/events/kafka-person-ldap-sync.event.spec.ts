import { faker } from '@faker-js/faker';
import { type PersonID } from '../types/aggregate-ids.types.js';
import { KafkaPersonLdapSyncEvent } from './kafka-person-ldap-sync.event.js';

describe('KafkaPersonLdapSyncEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const personId: PersonID = faker.string.uuid();

        const event: KafkaPersonLdapSyncEvent = new KafkaPersonLdapSyncEvent(personId);

        expect(event).toBeInstanceOf(KafkaPersonLdapSyncEvent);
        expect(event.kafkaKey).toBe(personId);
    });
});
