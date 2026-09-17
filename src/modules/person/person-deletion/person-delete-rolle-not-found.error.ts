import { DomainError } from '../../../shared/error/domain.error.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';

export class PersonDeleteRolleNotFoundError extends DomainError {
    public constructor(personenKontext: Personenkontext<true>, details?: unknown[] | Record<string, undefined>) {
        super(
            `Rolle not found for Personenkontext ${personenKontext.id}`,
            'PERSON_DELETE_ROLLE_NOT_FOUND_ERROR',
            details,
        );
    }
}
