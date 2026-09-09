import { DomainError } from '../../../shared/error/domain.error.js';

export class VeryfyNoTokenError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super('No token to verify', 'PRIVACY_IDEA_NO_TOKEN_TO_VERIFY', details);
    }
}
