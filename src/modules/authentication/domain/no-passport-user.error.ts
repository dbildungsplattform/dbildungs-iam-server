import { DomainError } from '../../../shared/error/domain.error.js';

export class NoPassportUserInRequestError extends DomainError {
    public constructor(details?: unknown[] | Record<string, undefined>) {
        super('No PassportUser found on request', 'NO_PASSPORT_USER_IN_REQUEST', details);
    }
}
