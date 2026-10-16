import { type PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { type PersonLockOccasion } from '../../person/domain/person.enums.js';

export class UserLock {
    private constructor(
        public person: PersonID,
        public locked_by: string,
        public locked_until: Date | undefined,
        public locked_occasion: PersonLockOccasion,
        public created_at: Date | undefined,
    ) {}

    public static construct(
        person: PersonID,
        locked_by: string,
        locked_until: Date | undefined,
        locked_occasion: PersonLockOccasion,
        created_at: Date,
    ): UserLock {
        return new UserLock(person, locked_by, locked_until, locked_occasion, created_at);
    }
}
