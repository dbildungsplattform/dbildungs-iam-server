import { DomainError } from '../../../../shared/error/domain.error.js';

export class InconsistentExternalIdForPersonError extends DomainError {
    public constructor(spshPersonId: string, details?: unknown[] | Record<string, unknown>) {
        super(
            `Addresses for spshPersonId: ${spshPersonId} do not share the same externalId, aborting migration`,
            'INCONSISTENT_EXTERNAL_ID_FOR_PERSON',
            details,
        );
    }
}
