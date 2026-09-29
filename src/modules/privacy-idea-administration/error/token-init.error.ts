import { DomainError } from '../../../shared/error/domain.error.js';

export class TokenInitError extends DomainError {
    public constructor(message: string = 'Unknown error occurred', details?: unknown[] | Record<string, unknown>) {
        super(`Error requesting 2fa token: ${message}`, 'PRIVACY_IDEA_TOKEN_INIT_ERROR', details);
    }
}
