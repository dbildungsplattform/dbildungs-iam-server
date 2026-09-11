import { DomainError } from '../../../shared/error/domain.error.js';

export class RemovePersonWithoutOrgError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super(
            'Failed to remove users due to an internal server error.',
            'CRON_PERSON_WITHOUT_ORG_REMOVE_ERROR',
            details,
        );
    }
}
