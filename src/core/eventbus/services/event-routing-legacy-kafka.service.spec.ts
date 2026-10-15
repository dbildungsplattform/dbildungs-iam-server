// eslint-disable-next-line max-classes-per-file
import { vi } from 'vitest';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { EventRoutingLegacyKafkaService } from './event-routing-legacy-kafka.service.js';
import { EventService } from './event.service.js';
import { KafkaEventService } from './kafka-event.service.js';
import { LoggingTestModule } from '../../../../test/utils/index.js';
import { BaseEvent } from '../../../shared/events/base-event.js';
import { type KafkaEvent } from '../../../shared/events/kafka-event.js';
import { ClassLogger } from '../../logging/class-logger.js';

function flushPromises(): Promise<void> {
    return new Promise((resolve: (value: void | PromiseLike<void>) => void) => {
        setImmediate(resolve);
    });
}

class BaseEventMock extends BaseEvent {}

class KafkaEventMock implements KafkaEvent {
    public kafkaKey: string | undefined;
}

describe('EventRoutingLegacyKafkaService', () => {
    let sut: EventRoutingLegacyKafkaService;
    let eventServiceMock: DeepMocked<EventService>;
    let kafkaEventServiceMock: DeepMocked<KafkaEventService>;
    let configServiceMock: DeepMocked<ConfigService>;
    let logger: DeepMocked<ClassLogger>;
    let module: TestingModule;

    async function setupModule(kafkaEnabled: boolean = false): Promise<void> {
        configServiceMock = createMock(ConfigService);
        configServiceMock.getOrThrow.mockReturnValue({ ENABLED: kafkaEnabled });

        module = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [
                EventRoutingLegacyKafkaService,
                { provide: EventService, useValue: createMock(EventService) },
                { provide: KafkaEventService, useValue: createMock(KafkaEventService) },
                { provide: ConfigService, useValue: configServiceMock },
            ],
        }).compile();

        await module.init();

        sut = module.get(EventRoutingLegacyKafkaService);
        eventServiceMock = module.get(EventService);
        kafkaEventServiceMock = module.get(KafkaEventService);
        logger = module.get(ClassLogger);
    }

    afterEach(async () => {
        vi.resetAllMocks();
        if (module) {
            await module.close();
        }
    });

    it('should be defined', async () => {
        await setupModule();
        expect(sut).toBeDefined();
    });

    describe('publish', () => {
        it('should publish to kafka when kafka is enabled and kafka event is provided', async () => {
            await setupModule(true);

            const legacyEvent: DeepMocked<BaseEvent> = createMock(BaseEventMock);
            const kafkaEvent: DeepMocked<KafkaEvent> = createMock(KafkaEventMock);
            kafkaEventServiceMock.publish.mockResolvedValue(undefined);

            sut.publish(legacyEvent, kafkaEvent);
            await flushPromises();

            expect(kafkaEventServiceMock.publish).toHaveBeenCalledWith(kafkaEvent);
            expect(eventServiceMock.publish).not.toHaveBeenCalled();
        });

        it('should publish to legacy event service when kafka is disabled', async () => {
            await setupModule(false);

            const legacyEvent: DeepMocked<BaseEvent> = createMock(BaseEventMock);
            const kafkaEvent: DeepMocked<KafkaEvent> = createMock(KafkaEventMock);

            sut.publish(legacyEvent, kafkaEvent);

            expect(kafkaEventServiceMock.publish).not.toHaveBeenCalled();
            expect(eventServiceMock.publish).toHaveBeenCalledWith(legacyEvent);
        });

        it('should publish to legacy event service when kafka event is not provided', async () => {
            await setupModule(true);

            const legacyEvent: DeepMocked<BaseEvent> = createMock(BaseEventMock);

            sut.publish(legacyEvent);

            expect(kafkaEventServiceMock.publish).not.toHaveBeenCalled();
            expect(eventServiceMock.publish).toHaveBeenCalledWith(legacyEvent);
        });

        it('should log error if publish throws error', async () => {
            await setupModule(true);

            const legacyEvent: DeepMocked<BaseEvent> = createMock(BaseEventMock);
            const kafkaEvent: DeepMocked<KafkaEvent> = createMock(KafkaEventMock);

            const error: Error = new Error('Kafka publish failed');
            kafkaEventServiceMock.publish.mockRejectedValue(error);

            sut.publish(legacyEvent, kafkaEvent);
            await flushPromises();

            expect(kafkaEventServiceMock.publish).toHaveBeenCalledWith(kafkaEvent);
            expect(eventServiceMock.publish).not.toHaveBeenCalled();
            expect(logger.logUnknownAsError).toHaveBeenCalled();
        });
    });
});
