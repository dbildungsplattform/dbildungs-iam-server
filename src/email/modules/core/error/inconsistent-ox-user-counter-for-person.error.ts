import { DomainError } from '../../../../shared/error/domain.error.js';

export class InconsistentOxUserCounterForPersonError extends DomainError {
    public constructor(spshPersonId: string, details?: unknown[] | Record<string, unknown>) {
        super(
            `Addresses for spshPersonId: ${spshPersonId} do not share the same oxUserCounter, aborting migration`,
            'INCONSISTENT_OX_USER_COUNTER_FOR_PERSON',
            details,
        );
    }
}
