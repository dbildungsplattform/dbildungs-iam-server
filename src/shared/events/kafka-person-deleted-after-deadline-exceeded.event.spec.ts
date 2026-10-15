import { KafkaPersonDeletedAfterDeadlineExceededEvent } from './kafka-person-deleted-after-deadline-exceeded.event.js';
import { type OXUserID } from '../types/ox-ids.types.js';
import { type PersonID, type PersonUsername } from '../types/aggregate-ids.types.js';

describe('KafkaPersonDeletedAfterDeadlineExceededEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const personId: PersonID = 'test-person-id';
        const username: PersonUsername = 'test-username';
        const oxUserId: OXUserID = '123';
        const event: KafkaPersonDeletedAfterDeadlineExceededEvent = new KafkaPersonDeletedAfterDeadlineExceededEvent(
            personId,
            username,
            oxUserId,
        );

        expect(event).toBeInstanceOf(KafkaPersonDeletedAfterDeadlineExceededEvent);
        expect(event.kafkaKey).toBe(personId);
    });
});
