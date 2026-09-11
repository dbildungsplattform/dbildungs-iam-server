import { DomainError } from '../../../shared/error/domain.error.js';

export class TokenVerifyError extends DomainError {
    public constructor(message: string = 'Unknown error occurred', details?: unknown[] | Record<string, unknown>) {
        super(`Error verifying token: ${message}`, 'PRIVACY_IDEA_TOKEN_VERIFY_ERROR', details);
    }
}
