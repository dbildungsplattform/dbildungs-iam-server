import { DomainError } from '../../../../shared/error/domain.error.js';

export class NoEmailAddressesForPersonError extends DomainError {
    public constructor(spshPersonId: string, details?: unknown[] | Record<string, unknown>) {
        super(`No email addresses found for spshPersonId: ${spshPersonId}`, 'NO_EMAIL_ADDRESSES_FOR_PERSON', details);
    }
}
