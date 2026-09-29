import { DomainError } from '../../../shared/error/domain.error.js';

export class UnlockUsersError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super('Failed to unlock users due to an internal server error.', 'CRON_UNLOCK_USERS_ERROR', details);
    }
}
