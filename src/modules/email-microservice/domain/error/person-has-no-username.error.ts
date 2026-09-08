import { DomainError } from "../../../../shared/error/domain.error.js";

export class PersonHasNoUsernameError extends DomainError {
    public constructor(personId: string, details?: unknown[] | Record<string, undefined>) {
        super(`Person with id:${personId} has no username, cannot resolve email.`,  'PERSON_HAS_NO_USERNAME', details);
    }
}
