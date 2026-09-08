import { DomainError } from '../../../shared/error/domain.error.js';

export class TokenUnassignError extends DomainError {
    public constructor(message: string = 'Unknown error occurred', details?: unknown[] | Record<string, unknown>) {
        super(`Error unassigning token: ${message}`, 'PRIVACY_IDEA_TOKEN_UNASSIGN_ERROR', details);
    }
}
