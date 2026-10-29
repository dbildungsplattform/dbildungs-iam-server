import { EntityManager } from '@mikro-orm/postgresql';
import { ConfigService } from '@nestjs/config';
import { type MockInstance, vi } from 'vitest';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { type EventOutboxConfig } from '../../../shared/config/event-outbox.config.js';
import { type KafkaConfig } from '../../../shared/config/kafka.config.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { KafkaEventService } from '../services/kafka-event.service.js';
import { EventOutboxPublisher } from './event-outbox-publisher.service.js';

type OutboxRow = {
    id: string;
    event_key: string;
    kafka_key: string | null;
    payload: string;
};

const outboxConfig: EventOutboxConfig = { POLL_INTERVAL_MS: 1000, BATCH_SIZE: 50 };

const row: OutboxRow = {
    id: 'row-1',
    event_key: 'rollenerweiterung.created',
    kafka_key: 'orga-1-rolle-1-sp-1',
    payload: '{"organisationId":"orga-1"}',
};

describe('EventOutboxPublisher', () => {
    let emMock: DeepMocked<EntityManager>;
    let kafkaEventServiceMock: DeepMocked<KafkaEventService>;
    let loggerMock: DeepMocked<ClassLogger>;

    function createSut(kafkaEnabled: boolean = true): EventOutboxPublisher {
        const configServiceMock: DeepMocked<ConfigService> = createMock(ConfigService);
        configServiceMock.getOrThrow.mockImplementation((key: string) => {
            if (key === 'KAFKA') {
                return { ENABLED: kafkaEnabled } satisfies Pick<KafkaConfig, 'ENABLED'>;
            }
            return outboxConfig;
        });
        return new EventOutboxPublisher(loggerMock, emMock, kafkaEventServiceMock, configServiceMock);
    }

    beforeEach(() => {
        emMock = createMock(EntityManager);
        emMock.transactional.mockImplementation((cb: (tx: EntityManager) => Promise<unknown>) =>
            Promise.resolve(cb(emMock)),
        );
        emMock.execute.mockResolvedValue([]);
        kafkaEventServiceMock = createMock(KafkaEventService);
        kafkaEventServiceMock.sendOutboxMessage.mockResolvedValue(undefined);
        loggerMock = createMock(ClassLogger);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetAllMocks();
    });

    describe('onModuleInit', () => {
        it('should not start polling when kafka is disabled', () => {
            const setIntervalSpy: MockInstance = vi.spyOn(globalThis, 'setInterval');
            const sut: EventOutboxPublisher = createSut(false);

            sut.onModuleInit();

            expect(setIntervalSpy).not.toHaveBeenCalled();
        });

        it('should start polling with the configured interval when kafka is enabled', () => {
            const setIntervalSpy: MockInstance = vi.spyOn(globalThis, 'setInterval');
            const sut: EventOutboxPublisher = createSut(true);

            sut.onModuleInit();
            sut.onModuleDestroy();

            expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), outboxConfig.POLL_INTERVAL_MS);
        });
    });

    describe('publishPending', () => {
        it('should send pending rows and mark them as published', async () => {
            const sut: EventOutboxPublisher = createSut();
            emMock.execute.mockResolvedValueOnce([row]);

            const count: number = await sut.publishPending();

            expect(count).toBe(1);
            expect(kafkaEventServiceMock.sendOutboxMessage).toHaveBeenCalledWith(
                'rollenerweiterung.created',
                'orga-1-rolle-1-sp-1',
                row.payload,
            );
            expect(emMock.execute).toHaveBeenLastCalledWith(expect.stringContaining('published_at = now()'), [row.id]);
        });

        it('should select rows with skip locked and the configured batch size', async () => {
            const sut: EventOutboxPublisher = createSut();

            await sut.publishPending();

            expect(emMock.execute).toHaveBeenCalledWith(expect.stringContaining('for update skip locked'), [
                outboxConfig.BATCH_SIZE,
            ]);
        });

        it('should return 0 and send nothing when there are no pending rows', async () => {
            const sut: EventOutboxPublisher = createSut();

            const count: number = await sut.publishPending();

            expect(count).toBe(0);
            expect(kafkaEventServiceMock.sendOutboxMessage).not.toHaveBeenCalled();
        });

        it('should record attempts and last error when sending fails', async () => {
            const sut: EventOutboxPublisher = createSut();
            emMock.execute.mockResolvedValueOnce([row]);
            kafkaEventServiceMock.sendOutboxMessage.mockRejectedValueOnce(new Error('broker down'));

            await sut.publishPending();

            expect(emMock.execute).toHaveBeenLastCalledWith(expect.stringContaining('last_error = ?'), [
                'broker down',
                row.id,
            ]);
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `Failed to publish outbox event ${row.id}`,
                expect.any(Error),
            );
        });

        it('should record an error for an unknown event key without sending', async () => {
            const sut: EventOutboxPublisher = createSut();
            emMock.execute.mockResolvedValueOnce([{ ...row, event_key: 'unknown.key' }]);

            await sut.publishPending();

            expect(kafkaEventServiceMock.sendOutboxMessage).not.toHaveBeenCalled();
            expect(emMock.execute).toHaveBeenLastCalledWith(expect.stringContaining('last_error = ?'), [
                'Unknown event key in outbox: unknown.key',
                row.id,
            ]);
        });

        it('should skip a run while a previous run is still in progress', async () => {
            const sut: EventOutboxPublisher = createSut();
            let release: () => void = () => {};
            emMock.transactional.mockImplementationOnce(
                (): Promise<number> =>
                    new Promise<number>((resolve: (value: number) => void) => {
                        release = (): void => resolve(0);
                    }),
            );

            const first: Promise<number> = sut.publishPending();
            const second: number = await sut.publishPending();
            release();
            await first;

            expect(second).toBe(0);
            expect(emMock.transactional).toHaveBeenCalledTimes(1);
        });

        it('should log and return 0 when the transaction fails', async () => {
            const sut: EventOutboxPublisher = createSut();
            emMock.transactional.mockRejectedValueOnce(new Error('db down'));

            const count: number = await sut.publishPending();

            expect(count).toBe(0);
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                'Event outbox publishing failed',
                expect.any(Error),
            );
        });
    });
});
