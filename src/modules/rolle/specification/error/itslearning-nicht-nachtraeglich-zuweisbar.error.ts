import { RolleDomainError } from '../../domain/rolle-domain.error.js';

export class ItslearningNichtNachtraeglichZuweisbarError extends RolleDomainError {
    public constructor(details?: unknown[] | Record<string, undefined>) {
        super(
            'The itslearning ServiceProvider cannot be added to or removed from a Rolle that is already assigned to persons.',
            undefined,
            details,
        );
    }
}
