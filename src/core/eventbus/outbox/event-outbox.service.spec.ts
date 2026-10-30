import { EntityManager } from '@mikro-orm/postgresql';
import { vi } from 'vitest';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { type KafkaEvent } from '../../../shared/events/kafka-event.js';
import { KafkaRollenerweiterungCreatedEvent } from '../../../shared/events/kafka-rollenerweiterung-created.event.js';
import { EventOutboxEntity } from './event-outbox.entity.js';
import { EventOutboxService } from './event-outbox.service.js';

class UnmappedEvent {
    public readonly kafkaKey: string = 'unmapped';
}

describe('EventOutboxService', () => {
    let sut: EventOutboxService;
    let emMock: DeepMocked<EntityManager>;

    beforeEach(() => {
        emMock = createMock(EntityManager);
        emMock.create.mockImplementation((_entity: unknown, data: unknown) => data as EventOutboxEntity);
        sut = new EventOutboxService(emMock);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('enqueueAll', () => {
        it('should throw when an event has no kafka mapping', async () => {
            const event: KafkaEvent = new UnmappedEvent();

            await expect(sut.enqueueAll([event])).rejects.toThrow('No Kafka mapping found for event: UnmappedEvent');
            expect(emMock.persist).not.toHaveBeenCalled();
            expect(emMock.flush).not.toHaveBeenCalled();
        });

        it('should persist an outbox row with event key, kafka key and payload and flush it', async () => {
            const event: KafkaEvent = new KafkaRollenerweiterungCreatedEvent('orga-1', 'rolle-1', 'sp-1');

            await sut.enqueueAll([event]);

            expect(emMock.create).toHaveBeenCalledWith(
                EventOutboxEntity,
                expect.objectContaining({
                    eventKey: 'rollenerweiterung.created',
                    kafkaKey: 'orga-1-rolle-1-sp-1',
                    payload: JSON.stringify(event),
                    publishedAt: null,
                    attempts: 0,
                    lastError: null,
                }),
            );
            expect(emMock.persist).toHaveBeenCalledTimes(1);
            expect(emMock.flush).toHaveBeenCalledTimes(1);
        });
    });
});
