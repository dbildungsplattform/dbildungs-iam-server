import { DomainError } from '../../../shared/error/index.js';
import { type PersonID } from '../../../shared/types/aggregate-ids.types.js';

export class PersonAlreadyHasEnabledEmailAddressError extends DomainError {
    public constructor(personId: PersonID, address: string, details?: unknown[] | Record<string, unknown>) {
        super(
            `Person with personId:${personId} already has an enabled EmailAddress, address:${address}`,
            'ENTITY_COULD_NOT_BE_UPDATED',
            details,
        );
    }
}
