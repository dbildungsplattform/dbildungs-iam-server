import { DomainError } from '../../../shared/error/domain.error.js';

export class EventHandlerShutdownError extends DomainError {
    public constructor(eventName: string, details?: unknown[] | Record<string, undefined>) {
        super(
            `Handler for event ${eventName} was aborted because of application shutdown`,
            'EVENT_HANDLER_SHUTDOWN',
            details,
        );
    }
}
