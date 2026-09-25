import { faker } from '@faker-js/faker';
import { PersonLockOccasion } from '../../modules/person/domain/person.enums.js';
import { PersonID } from '../types/aggregate-ids.types.js';
import { KafkaLocksForPersonChangedEvent } from './kafka-locks-for-person-changed.event.js';
import { UserLockEventData } from './locks-for-person-changed.event.js';

describe('KafkaLocksForPersonChangedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const personId: PersonID = faker.string.uuid();
        const oldLocks: UserLockEventData[] = [
            {
                locked_until: faker.date.future(),
                locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
            },
        ];
        const newLocks: UserLockEventData[] = [
            {
                locked_until: faker.date.future(),
                locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
            },
        ];

        const event: KafkaLocksForPersonChangedEvent = new KafkaLocksForPersonChangedEvent(
            personId,
            oldLocks,
            newLocks,
        );

        expect(event).toBeInstanceOf(KafkaLocksForPersonChangedEvent);
        expect(event.oldLocks).toBe(oldLocks);
        expect(event.newLocks).toBe(newLocks);
        expect(event.kafkaKey).toBe(personId);
    });
});