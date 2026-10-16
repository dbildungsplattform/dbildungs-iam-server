import { type KafkaEvent } from '../kafka-event.js';
import { type PersonRenamedEvent } from '../person-renamed-event.js';
import { LdapPersonEntryRenamedEvent } from './ldap-person-entry-renamed.event.js';

/**
 * This event is used to chain LdapEventHandler and EmailEventHandler, so operations as result
 * of renaming a user are executed after each other rather than in parallel.
 */
export class KafkaLdapPersonEntryRenamedEvent extends LdapPersonEntryRenamedEvent implements KafkaEvent {
    public get kafkaKey(): string | undefined {
        return this.personId;
    }

    public static override fromPersonRenamedEvent(
        personRenamedEvent: PersonRenamedEvent,
    ): KafkaLdapPersonEntryRenamedEvent {
        return new KafkaLdapPersonEntryRenamedEvent(
            personRenamedEvent.personId,
            personRenamedEvent.vorname,
            personRenamedEvent.familienname,
            personRenamedEvent.username,
            personRenamedEvent.oldVorname,
            personRenamedEvent.oldFamilienname,
            personRenamedEvent.oldUsername,
        );
    }
}
