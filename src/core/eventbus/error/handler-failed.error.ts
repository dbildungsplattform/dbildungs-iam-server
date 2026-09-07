import { DomainError } from "../../../shared/error/domain.error.js";

export class EventHandlerFailedError extends DomainError {
    public constructor(eventName: string, details?: unknown[] | Record<string, undefined>) {
        super(`Handler failed for event ${eventName}`,  'EVENT_HANDLER_FAILED', details);
    }
}
