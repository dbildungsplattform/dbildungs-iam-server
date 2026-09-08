import { DomainError } from "../../../shared/error/domain.error.js";

export class UpdateUsernameMissingError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super('Username is missing', 'PRIVACY_IDEA_EVENT_PERSON_RENAMED_USERNAME_MISSING_ERROR', details);
    }
}
