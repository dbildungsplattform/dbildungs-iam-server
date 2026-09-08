import { DomainError } from '../../../shared/error/domain.error.js';

export class UserCheckError extends DomainError {
    public constructor(message: string = 'Unknown error occurred', details?: unknown[] | Record<string, unknown>) {
        super(`Error checking user exists: ${message}`, 'PRIVACY_IDEA_USER_CHECK_ERROR', details);
    }
}
