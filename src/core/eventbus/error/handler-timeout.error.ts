import { DomainError } from "../../../shared/error/domain.error.js";
import { BaseEvent } from "../../../shared/events/base-event.js";

export class EventHandlerTimeoutError<Event extends BaseEvent> extends DomainError {
    public constructor(event: Event, timeoutMs: number, details?: unknown[] | Record<string, undefined>) {
        super(`Handler for event ${event.constructor.name} with EventID: ${event.eventID} timed out after ${timeoutMs}ms`, 'EVENT_HANDLER_TIMEOUT', details);
    }
}
