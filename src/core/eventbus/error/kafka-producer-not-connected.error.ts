import { DomainError } from '../../../shared/error/domain.error.js';

export class KafkaProducerNotConnectedError extends DomainError {
    public constructor() {
        super('Kafka producer is not connected', 'KAFKA_PRODUCER_NOT_CONNECTED');
    }
}
