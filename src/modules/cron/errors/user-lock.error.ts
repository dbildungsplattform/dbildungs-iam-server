import { DomainError } from '../../../shared/error/domain.error.js';

export class UserLockError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super('Failed to lock users due to an internal server error.', 'CRON_USER_LOCK_ERROR', details);
    }
}
