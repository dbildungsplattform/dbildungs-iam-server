import { faker } from '@faker-js/faker';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type Person } from '../../../modules/person/domain/person.js';
import { KafkaLdapPersonEntryChangedEvent } from './kafka-ldap-person-entry-changed.event.js';
import { type PersonUsername } from '../../types/aggregate-ids.types.js';

describe('KafkaLdapPersonEntryChangedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const person: Person<true> = DoFactory.createPerson(true);
        const username: PersonUsername = faker.internet.username();
        const primaryMail: string = faker.internet.email();
        const alternativeMail: string = faker.internet.email();
        const passwordChanged: boolean = faker.datatype.boolean();

        const event: KafkaLdapPersonEntryChangedEvent = new KafkaLdapPersonEntryChangedEvent(
            person.id,
            username,
            primaryMail,
            alternativeMail,
            passwordChanged,
        );

        expect(event).toBeInstanceOf(KafkaLdapPersonEntryChangedEvent);
        expect(event.kafkaKey).toBe(person.id);
        expect(event.personId).toBe(person.id);
        expect(event.username).toBe(username);
        expect(event.mailPrimaryAddress).toBe(primaryMail);
        expect(event.mailAlternativeAddress).toBe(alternativeMail);
        expect(event.userPasswordChanged).toBe(passwordChanged);
    });
});
