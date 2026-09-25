import { PersonLockOccasion } from '../../modules/person/domain/person.enums.js';
import { PersonID } from '../types/index.js';
import { BaseEvent } from './base-event.js';

export type UserLockEventData = {
    locked_until: Date | undefined;
    locked_occasion: PersonLockOccasion;
};

export class LocksForPersonChangedEvent extends BaseEvent {
    public constructor(
        public readonly personId: PersonID,
        public readonly oldLocks: UserLockEventData[],
        public readonly newLocks: UserLockEventData[],
    ) {
        super();
    }
}