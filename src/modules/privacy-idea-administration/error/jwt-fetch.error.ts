import { DomainError } from '../../../shared/error/domain.error.js';

export class JwtFetchError extends DomainError {
    public constructor(message: string = 'Unknown error occurred', details?: unknown[] | Record<string, unknown>) {
        super(`Error fetching JWT token: ${message}`, 'PRIVACY_IDEA_JWT_FETCH_ERROR', details);
    }
}
