import { DomainError } from '../../../shared/error/domain.error.js';

export class EventMappingNotFoundError extends DomainError {
    public constructor(eventName: string) {
        super(`No Kafka mapping found for event: ${eventName}`, 'EVENT_MAPPING_NOT_FOUND');
    }
}
