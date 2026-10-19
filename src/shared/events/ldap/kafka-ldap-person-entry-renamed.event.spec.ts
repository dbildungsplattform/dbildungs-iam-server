import { faker } from '@faker-js/faker';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type Person } from '../../../modules/person/domain/person.js';
import { PersonRenamedEvent } from '../person-renamed-event.js';
import { KafkaLdapPersonEntryRenamedEvent } from './kafka-ldap-person-entry-renamed.event.js';

describe('KafkaLdapPersonEntryRenamedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const person: Person<true> = DoFactory.createPerson(true);
        const renamedEvent: PersonRenamedEvent = PersonRenamedEvent.fromPerson(
            person,
            faker.internet.username(),
            faker.person.firstName(),
            faker.person.lastName(),
        );

        const event: KafkaLdapPersonEntryRenamedEvent =
            KafkaLdapPersonEntryRenamedEvent.fromPersonRenamedEvent(renamedEvent);

        expect(event).toBeInstanceOf(KafkaLdapPersonEntryRenamedEvent);
        expect(event.kafkaKey).toBe(person.id);
    });
});
