import { DomainError } from '../../../shared/error/domain.error.js';

export class InvalidKafkaConfigError extends DomainError {
    public constructor(message: string, details?: unknown[] | Record<string, undefined>) {
        super(`Invalid Kafka configuration: ${message}`, 'INVALID_KAFKA_CONFIG', details);
    }
}
