import { DomainError } from '../../../shared/error/domain.error.js';

export class UserTokensError extends DomainError {
    public constructor(message: string = 'Unknown error occurred', details?: unknown[] | Record<string, unknown>) {
        super(`Error getting user tokens: ${message}`, 'PRIVACY_IDEA_USER_TOKENS_ERROR', details);
    }
}
