import { DomainError } from './domain.error.js';

export class PersonalnummerWithoutKoperspflichtError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super('Person hat keine koperspflichtige Rolle', 'PERSON_CREATE_WITH_PERSONALNUMMER_WITHOUT_KOPERSPFLICHT', details);
    }
}
