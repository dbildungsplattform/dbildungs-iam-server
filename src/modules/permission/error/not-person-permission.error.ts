import { DomainError } from '../../../shared/error/domain.error.js';

export class NotPersonPermissionError extends DomainError {
    public constructor(details?: unknown[] | Record<string, undefined>) {
        super(
            'Provided permissions are neither PersonPermissions nor EscalatedPersonPermissions',
            'ESCALATERD_PERMISSION_NOT_PERSON_PERMISSION',
            details,
        );
    }
}
