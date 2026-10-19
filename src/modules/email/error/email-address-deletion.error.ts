import { DomainError } from '../../../shared/error/index.js';
import { type EmailAddressID } from '../../../shared/types/aggregate-ids.types.js';

export class EmailAddressDeletionError extends DomainError {
    public constructor(id: EmailAddressID, address?: string, details?: unknown[] | Record<string, unknown>) {
        super(`Could not delete EmailAddress, id:${id}, address:${address}`, 'EMAIL_ADDRESS_DELETION_ERROR', details);
    }
}
