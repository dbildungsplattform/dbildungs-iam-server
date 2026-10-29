import { DomainError } from '../../../shared/error/domain.error.js';

export class UnknownOutboxEventKeyError extends DomainError {
    public constructor(eventKey: string) {
        super(`Unknown event key in outbox: ${eventKey}`, 'UNKNOWN_OUTBOX_EVENT_KEY');
    }
}
