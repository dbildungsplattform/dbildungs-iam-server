import { DomainError } from '../../../shared/error/domain.error.js';

export class TokenDeleteError extends DomainError {
    public constructor(message: string = 'Unknown error occurred', details?: unknown[] | Record<string, unknown>) {
        super(`Error deleting token: ${message}`, 'PRIVACY_IDEA_TOKEN_DELETE_ERROR', details);
    }
}
