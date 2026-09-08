import { DomainError } from '../../../shared/error/domain.error.js';

export class PersonenkontextRemoveExpiredError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super('Failed to remove kontexte due to an internal server error.', 'CRON_PERSONENKONTEXT_REMOVE_EXPIRED_ERROR', details);
    }
}
