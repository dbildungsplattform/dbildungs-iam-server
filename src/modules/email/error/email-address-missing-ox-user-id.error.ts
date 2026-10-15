import { DomainError } from '../../../shared/error/index.js';
import { type EmailAddressID } from '../../../shared/types/aggregate-ids.types.js';

export class EmailAddressMissingOxUserIdError extends DomainError {
    public constructor(id: EmailAddressID, address?: string, details?: unknown[] | Record<string, unknown>) {
        super(
            `Could not create Event, OxUSerId is missing for EmailAddress, id:${id}, address:${address}`,
            'EMAIL_ADDRESS_EVENT_CREATION_ERROR',
            details,
        );
    }
}
