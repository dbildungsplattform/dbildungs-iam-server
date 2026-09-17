import { DomainError } from '../../../shared/error/domain.error.js';

export class UserCreationError extends DomainError {
    public constructor(message: string = 'Unknown error occurred', details?: unknown[] | Record<string, unknown>) {
        super(`Error adding user: ${message}`, 'PRIVACY_IDEA_USER_CREATION_ERROR', details);
    }
}
