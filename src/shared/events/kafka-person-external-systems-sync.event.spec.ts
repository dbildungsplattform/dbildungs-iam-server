import { faker } from '@faker-js/faker';
import { type PersonID } from '../types/aggregate-ids.types.js';
import { KafkaPersonExternalSystemsSyncEvent } from './kafka-person-external-systems-sync.event.js';

describe('KafkaPersonExternalSystemsSyncEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const personId: PersonID = faker.string.uuid();

        const event: KafkaPersonExternalSystemsSyncEvent = new KafkaPersonExternalSystemsSyncEvent(personId);

        expect(event).toBeInstanceOf(KafkaPersonExternalSystemsSyncEvent);
        expect(event.kafkaKey).toBe(personId);
    });
});
