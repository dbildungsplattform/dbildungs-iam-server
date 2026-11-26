import { type Mock, vi } from 'vitest';
import { type TestingModule, Test } from '@nestjs/testing';
import { LoggingTestModule } from '../../../../test/utils/index.js';
import { BaseEvent } from '../../../shared/events/index.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { KafkaEventService } from './kafka-event.service.js';
import { type KafkaEvent } from '../../../shared/events/kafka-event.js';
import { ConfigService } from '@nestjs/config';
import { type KafkaConfig } from '../../../shared/config/kafka.config.js';
import { type KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaPersonDeletedEvent } from '../../../shared/events/kafka-person-deleted.event.js';
import { KafkaImportExecutedEvent } from '../../../shared/events/kafka-import-executed.event.js';
import { KAFKA_INSTANCE } from '../kafka-client-provider.js';
import { inspect } from 'util';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { EventHandlerFailedError } from '../error/handler-failed.error.js';
import { EventHandlerShutdownError } from '../error/handler-shutdown.error.js';
import { EventHandlerTimeoutError } from '../error/handler-timeout.error.js';
import { InvalidKafkaConfigError } from '../error/invalid-kafka-config.error.js';

type Kafka = KafkaJS.Kafka;
type Consumer = KafkaJS.Consumer;
type Producer = KafkaJS.Producer;
type KafkaMessage = KafkaJS.KafkaMessage;
type EachMessageHandler = KafkaJS.EachMessageHandler;
type ConsumerRunConfig = KafkaJS.ConsumerRunConfig;
type EachMessagePayload = KafkaJS.EachMessagePayload;

function errorOf(result: Result<unknown, Error>): Error | undefined {
    return result.ok ? undefined : result.error;
}

class TestEvent extends BaseEvent implements KafkaEvent {
    public constructor() {
        super();
    }

    public get kafkaKey(): string {
        return 'test';
    }
}

describe('KafkaEventService', () => {
    let module: TestingModule;
    let sut: KafkaEventService;
    let logger: DeepMocked<ClassLogger>;
    let configService: DeepMocked<ConfigService>;
    let kafka: DeepMocked<Kafka>;
    let consumer: DeepMocked<Consumer>;
    let producer: DeepMocked<Producer>;

    const defaultKafkaConfig: KafkaConfig = {
        BROKER: 'broker',
        GROUP_ID: 'groupId',
        SESSION_TIMEOUT: 300000,
        HEARTBEAT_INTERVAL: 3000,
        TOPIC_PREFIX: 'prefix.',
        USER_TOPIC: 'user-topic',
        USER_DLQ_TOPIC: 'dlq-topic',
        ENABLED: true,
        SSL_ENABLED: false,
        SSL_CA_PATH: undefined,
        SSL_CERT_PATH: undefined,
        SSL_KEY_PATH: undefined,
    };

    beforeEach(async () => {
        configService = createMock(ConfigService);
        configService.getOrThrow.mockReturnValue({ ...defaultKafkaConfig } satisfies KafkaConfig);

        producer = {
            connect: vi.fn(),
            disconnect: vi.fn(),
            send: vi.fn(),
            sendBatch: vi.fn(),
        } as unknown as DeepMocked<Producer>;
        consumer = {
            connect: vi.fn(),
            disconnect: vi.fn(),
            subscribe: vi.fn(),
            run: vi.fn(),
        } as unknown as DeepMocked<Consumer>;
        kafka = {
            producer: vi.fn(() => producer),
            consumer: vi.fn(() => consumer),
        } as unknown as DeepMocked<Kafka>;

        module = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [
                KafkaEventService,
                { provide: ConfigService, useValue: configService },
                { provide: KAFKA_INSTANCE, useValue: kafka },
            ],
        }).compile();

        sut = module.get(KafkaEventService);
        logger = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    it('should initialize Kafka connections on module init', async () => {
        await sut.onModuleInit();

        expect(consumer.connect).toHaveBeenCalled();
        expect(consumer.subscribe).toHaveBeenCalledWith({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            topics: expect.arrayContaining(['prefix.user-topic']),
        });
        expect(producer.connect).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith('Connecting to Kafka');
    });

    it('should disconnect Kafka connections on module destroy', async () => {
        await sut.onModuleDestroy();

        expect(consumer.disconnect).toHaveBeenCalled();
        expect(producer.disconnect).toHaveBeenCalled();
    });

    it('should configure the consumer with the default max.poll.interval.ms', () => {
        expect(kafka.consumer).toHaveBeenCalledWith(
            expect.objectContaining({
                'max.poll.interval.ms': 300000,
                'session.timeout.ms': 300000,
                'heartbeat.interval.ms': 3000,
            }),
        );
    });

    it('should handle message correctly', async () => {
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from(JSON.stringify(new TestEvent())),
            headers: { eventKey: 'user.deleted' },
        } as unknown as KafkaMessage);

        const handler: Mock = vi.fn();
        sut.subscribe(KafkaPersonDeletedEvent, handler);

        await sut.handleMessage(message);

        expect(handler).toHaveBeenCalled();
        expect(logger.info).toHaveBeenNthCalledWith(1, 'Handling event: KafkaPersonDeletedEvent with 1 handlers');
        expect(logger.info).toHaveBeenNthCalledWith(
            2,
            expect.stringMatching(
                /^Handler for event KafkaPersonDeletedEvent with EventID: .+ completed successfully$/,
            ),
        );
    });

    it('should do nothing if no handlers are registered', async () => {
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from(JSON.stringify(new TestEvent())),
            headers: { eventKey: 'schule.created' },
        } as unknown as KafkaMessage);

        await sut.handleMessage(message);

        expect(logger.info).not.toHaveBeenCalledWith(
            expect.stringContaining('Handling event: KafkaSchuleCreatedEvent'),
        );
    });

    it('should log error if event type header is missing', async () => {
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from(JSON.stringify(new TestEvent())),
            headers: {},
        } as unknown as KafkaMessage);

        await sut.handleMessage(message);

        expect(logger.error).toHaveBeenCalledWith('Event type header is missing');
    });

    it('should log error if event type is unknown', async () => {
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from(JSON.stringify(new TestEvent())),
            headers: { eventKey: 'UnknownEvent' },
        } as unknown as KafkaMessage);

        await sut.handleMessage(message);

        expect(logger.error).toHaveBeenCalledWith('Event type in header: UnknownEvent is not a valid KafkaEventKey');
    });

    it('should log error if parsed kafka message is not valid', async () => {
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from(JSON.stringify([{ invalid: 'invalid' }])),
            headers: { eventKey: 'user.deleted' },
        } as unknown as KafkaMessage);

        await sut.handleMessage(message);

        expect(logger.error).toHaveBeenCalledWith('Parsed Kafka message is not a valid object');
    });

    it('should log error if parsing kafka message throws error', async () => {
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from('{ invalidJson: '),
            headers: { eventKey: 'user.deleted' },
        } as unknown as KafkaMessage);
        await sut.handleMessage(message);

        expect(logger.logUnknownAsError).toHaveBeenCalledWith('Failed to parse Kafka message', expect.any(SyntaxError));
    });

    it('should log error if handler throws an exception', async () => {
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from(JSON.stringify(new TestEvent())),
            headers: { eventKey: 'user.deleted' },
        } as unknown as KafkaMessage);
        const handler: Mock = vi.fn().mockRejectedValue(new Error('Handler error'));
        sut.subscribe(KafkaPersonDeletedEvent, handler);

        await sut.handleMessage(message);

        expect(logger.logUnknownAsError).toHaveBeenCalled();
    });

    it('should log error if handler throws an sync exception', async () => {
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from(JSON.stringify(new TestEvent())),
            headers: { eventKey: 'user.deleted' },
        } as unknown as KafkaMessage);
        const handler: Mock = vi.fn().mockImplementation(() => {
            throw new Error('Handler error');
        });
        sut.subscribe(KafkaPersonDeletedEvent, handler);
        await sut.handleMessage(message);
        expect(logger.logUnknownAsError).toHaveBeenCalledWith(
            expect.stringMatching(/^Handler for event KafkaPersonDeletedEvent with EventID: .+ failed$/),
            expect.any(Error),
        );
    });

    it('should log error if message value is invalid JSON', async () => {
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: undefined,
            headers: { eventKey: 'user.deleted' },
        } as unknown as KafkaMessage);
        const handler: Mock = vi.fn();
        sut.subscribe(KafkaPersonDeletedEvent, handler);

        await sut.handleMessage(message);

        expect(logger.error).toHaveBeenCalledWith('Message value is empty or undefined');
    });

    it('should publish to DLQ if handler returns an error', async () => {
        const deleteEvent: KafkaPersonDeletedEvent = new KafkaPersonDeletedEvent('test', 'test');

        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from(JSON.stringify(deleteEvent)),
            headers: { eventKey: 'user.deleted' },
        } as unknown as KafkaMessage);
        const error: Error = new Error('Handler error');
        const handler: Mock = vi.fn().mockReturnValue({ ok: false, error: error });
        sut.subscribe(KafkaPersonDeletedEvent, handler);

        await sut.handleMessage(message);
        expect(producer.send).toHaveBeenCalledWith({
            topic: 'prefix.user-dlq-topic',
            messages: [
                {
                    key: 'test',
                    value: JSON.stringify(deleteEvent),
                    headers: { eventKey: 'user.deleted', error: inspect(error) },
                },
            ],
        });

        expect(logger.info).toHaveBeenNthCalledWith(1, 'Handling event: KafkaPersonDeletedEvent with 1 handlers');
    });

    it('should publish event correctly', async () => {
        const deleteEvent: KafkaPersonDeletedEvent = new KafkaPersonDeletedEvent('test', 'test');

        await sut.publish(deleteEvent);

        expect(producer.send).toHaveBeenCalledWith({
            topic: 'prefix.user-topic',
            messages: [{ key: 'test', value: JSON.stringify(deleteEvent), headers: { eventKey: 'user.deleted' } }],
        });
        expect(logger.info).toHaveBeenCalledWith(
            'Publishing KafkaPersonDeletedEvent to Kafka on topic prefix.user-topic',
        );
    });

    it('should log error if Kafka producer fails during publish', async () => {
        const error: Error = new Error('Producer error');
        producer.send.mockRejectedValueOnce(error);
        const deleteEvent: KafkaPersonDeletedEvent = new KafkaPersonDeletedEvent('test', 'test');

        await sut.publish(deleteEvent);

        expect(logger.logUnknownAsError).toHaveBeenCalledWith(
            'Error publishing event to Kafka on topic prefix.user-topic',
            error,
        );
    });

    describe('publishMultiple', () => {
        it('should send all events in one batch grouped by topic', async () => {
            const personDeleted: KafkaPersonDeletedEvent = new KafkaPersonDeletedEvent('test', 'test');
            const importExecuted: KafkaImportExecutedEvent = new KafkaImportExecutedEvent(
                'import-1',
                'orga-1',
                'rolle-1',
                'keycloak-1',
            );
            const personDeletedOther: KafkaPersonDeletedEvent = new KafkaPersonDeletedEvent('other', 'other');

            await sut.publishMultiple([personDeleted, importExecuted, personDeletedOther]);

            expect(producer.sendBatch).toHaveBeenCalledTimes(1);
            expect(producer.sendBatch).toHaveBeenCalledWith({
                topicMessages: [
                    {
                        topic: 'prefix.user-topic',
                        messages: [
                            {
                                key: 'test',
                                value: JSON.stringify(personDeleted),
                                headers: { eventKey: 'user.deleted' },
                            },
                            {
                                key: 'other',
                                value: JSON.stringify(personDeletedOther),
                                headers: { eventKey: 'user.deleted' },
                            },
                        ],
                    },
                    {
                        topic: 'prefix.import-topic',
                        messages: [
                            {
                                key: 'import-1',
                                value: JSON.stringify(importExecuted),
                                headers: { eventKey: 'import.executed' },
                            },
                        ],
                    },
                ],
            });
            expect(producer.send).not.toHaveBeenCalled();
        });

        it('should skip events without mapping and log error', async () => {
            const event: KafkaEvent = new TestEvent();
            const deleteEvent: KafkaPersonDeletedEvent = new KafkaPersonDeletedEvent('test', 'test');

            await sut.publishMultiple([event, deleteEvent]);

            expect(logger.error).toHaveBeenCalledWith('(Batch publishing) No mapping found for event: TestEvent');
            expect(producer.sendBatch).toHaveBeenCalledWith({
                topicMessages: [
                    {
                        topic: 'prefix.user-topic',
                        messages: [
                            { key: 'test', value: JSON.stringify(deleteEvent), headers: { eventKey: 'user.deleted' } },
                        ],
                    },
                ],
            });
        });

        it('should not send anything for an empty list', async () => {
            await sut.publishMultiple([]);

            expect(producer.sendBatch).not.toHaveBeenCalled();
        });

        it('should not send anything when no event has a mapping', async () => {
            await sut.publishMultiple([new TestEvent()]);

            expect(producer.sendBatch).not.toHaveBeenCalled();
        });

        it('should log error if Kafka producer fails during batch publish', async () => {
            const error: Error = new Error('Producer error');
            producer.sendBatch.mockRejectedValueOnce(error);

            await sut.publishMultiple([new KafkaPersonDeletedEvent('test', 'test')]);

            expect(logger.logUnknownAsError).toHaveBeenCalledWith('Error publishing event batch to Kafka', error);
        });
    });

    it('should log error if no mapping is found for event type in publsih process', async () => {
        const event: KafkaEvent = new TestEvent();

        await sut.publish(event);

        expect(logger.error).toHaveBeenCalledWith('(Standard publishing) No mapping found for event: TestEvent');
    });

    it('should log error if no mapping is found for event type in dlq publish process', async () => {
        const event: KafkaEvent = new TestEvent();

        await sut.publishToDLQ(event, new Error());

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('(DLQ publishing) No mapping found for event: TestEvent'),
        );
    });

    it('callback should trigger handler method', async () => {
        let consumerCb: EachMessageHandler | undefined;
        consumer.run.mockImplementationOnce((config: ConsumerRunConfig | undefined) => {
            consumerCb = config?.eachMessage;
            return Promise.resolve();
        });

        const payload: DeepMocked<EachMessagePayload> = {
            message: {
                key: Buffer.from('test'),
                value: Buffer.from(JSON.stringify(new TestEvent())),
                headers: { eventKey: 'user.deleted' },
                offset: '0',
            } as unknown as KafkaMessage,
            partition: 0,
            topic: 'topic',
        } as unknown as DeepMocked<EachMessagePayload>;

        const handleMessageSpy: Mock = vi.spyOn(sut, 'handleMessage').mockResolvedValue(undefined);

        await sut.onModuleInit();

        if (consumerCb) {
            await consumerCb(payload);
        }

        expect(handleMessageSpy).toHaveBeenCalledWith(payload.message);
    });

    it('should log error in onModuleInit if Kafka consumer fails to connect', async () => {
        const error: Error = new Error('Consumer error');
        consumer.connect.mockRejectedValueOnce(error);

        await sut.onModuleInit();

        expect(logger.logUnknownAsError).toHaveBeenCalledWith('Error in KafkaEventService', error);
    });

    it('should not initialize Kafka consumer and producer if fkafka is disabled', () => {
        vi.clearAllMocks();

        const configServiceKafkaDisabled: DeepMocked<ConfigService> = createMock(ConfigService);
        configServiceKafkaDisabled.getOrThrow.mockReturnValue({
            ...defaultKafkaConfig,
            ENABLED: false,
        } satisfies KafkaConfig);
        new KafkaEventService(logger, kafka, configServiceKafkaDisabled);

        expect(logger.info).toHaveBeenCalledWith('Kafka is disabled');
        expect(kafka.consumer).not.toHaveBeenCalled();
        expect(kafka.producer).not.toHaveBeenCalled();
    });

    it('should not connect to Kafka if kafka is disabled in onModuleInit', async () => {
        vi.clearAllMocks();

        const configServiceKafkaDisabled: DeepMocked<ConfigService> = createMock(ConfigService);
        configServiceKafkaDisabled.getOrThrow.mockReturnValue({
            ...defaultKafkaConfig,
            ENABLED: false,
        } satisfies KafkaConfig);
        const service: KafkaEventService = new KafkaEventService(logger, kafka, configServiceKafkaDisabled);

        await service.onModuleInit();

        expect(logger.info).toHaveBeenCalledWith('Kafka is disabled');
        expect(consumer.connect).not.toHaveBeenCalled();
        expect(producer.connect).not.toHaveBeenCalled();
    });

    describe('configuration', () => {
        it('should use the configured timing values', async () => {
            vi.useFakeTimers();
            configService.getOrThrow.mockReturnValue({
                ...defaultKafkaConfig,
                MAX_POLL_INTERVAL: 120000,
                HANDLER_TIMEOUT: 1000,
                HANDLER_CANCEL_GRACE: 500,
            } satisfies KafkaConfig);
            const service: KafkaEventService = new KafkaEventService(logger, kafka, configService);
            const handler: Mock = vi.fn(() => new Promise(() => {}));

            const promise: Promise<Result<unknown, Error>> = service.runHandler(
                handler,
                new KafkaPersonDeletedEvent('test', 'test'),
            );
            await vi.advanceTimersByTimeAsync(1500);
            const result: Result<unknown, Error> = await promise;

            expect(kafka.consumer).toHaveBeenLastCalledWith(
                expect.objectContaining({ 'max.poll.interval.ms': 120000 }),
            );
            expect(errorOf(result)).toBeInstanceOf(EventHandlerTimeoutError);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('timed out after 1000ms'));
            expect(logger.crit).toHaveBeenCalledWith(expect.stringContaining('did not stop within 500ms'));

            vi.useRealTimers();
        });

        it('should throw if handler timeout, cancel grace and reserve do not fit into max.poll.interval.ms', () => {
            configService.getOrThrow.mockReturnValue({
                ...defaultKafkaConfig,
                MAX_POLL_INTERVAL: 10000,
                HANDLER_TIMEOUT: 8000,
                HANDLER_CANCEL_GRACE: 2000,
            } satisfies KafkaConfig);

            expect(() => new KafkaEventService(logger, kafka, configService)).toThrow(InvalidKafkaConfigError);
            expect(() => new KafkaEventService(logger, kafka, configService)).toThrow(
                'HANDLER_TIMEOUT (8000ms) + HANDLER_CANCEL_GRACE (2000ms) + reserve (10000ms) must be smaller than MAX_POLL_INTERVAL (10000ms)',
            );
        });

        it('should not validate the timing values if kafka is disabled', () => {
            configService.getOrThrow.mockReturnValue({
                ...defaultKafkaConfig,
                ENABLED: false,
                MAX_POLL_INTERVAL: 10000,
                HANDLER_TIMEOUT: 8000,
                HANDLER_CANCEL_GRACE: 2000,
            } satisfies KafkaConfig);

            expect(() => new KafkaEventService(logger, kafka, configService)).not.toThrow();
        });
    });

    describe('handler execution', () => {
        const event: KafkaPersonDeletedEvent = new KafkaPersonDeletedEvent('test', 'test');

        function createMessage(): KafkaMessage {
            return {
                key: Buffer.from('test'),
                value: Buffer.from(JSON.stringify(event)),
                headers: { eventKey: 'user.deleted' },
            } as unknown as KafkaMessage;
        }

        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should abort a cooperating handler on timeout and wait until it has stopped before returning', async () => {
            let receivedSignal: AbortSignal | undefined;
            let handlerStopped: boolean = false;
            const handler: Mock = vi.fn(
                (_event: BaseEvent, _keepAlive: () => void, signal: AbortSignal) =>
                    new Promise((_resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
                        receivedSignal = signal;
                        signal.addEventListener('abort', () => {
                            setTimeout(() => {
                                handlerStopped = true;
                                reject(signal.reason as Error);
                            }, 100);
                        });
                    }),
            );
            sut.subscribe(KafkaPersonDeletedEvent, handler);
            let handled: boolean = false;

            const handlePromise: Promise<void> = sut.handleMessage(createMessage()).then(() => {
                handled = true;
            });
            await vi.advanceTimersByTimeAsync(60000);

            expect(receivedSignal?.aborted).toBe(true);
            expect(handlerStopped).toBe(false);
            expect(handled).toBe(false);

            await vi.advanceTimersByTimeAsync(100);
            await handlePromise;

            expect(handlerStopped).toBe(true);
            expect(logger.error).toHaveBeenCalledTimes(1);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('timed out after 60000ms'));
            expect(logger.crit).not.toHaveBeenCalled();
            expect(logger.logUnknownAsError).toHaveBeenCalledWith(
                expect.stringMatching(
                    /^Handler for event KafkaPersonDeletedEvent with EventID: .+ failed after being aborted$/,
                ),
                expect.any(EventHandlerTimeoutError),
            );
            expect(producer.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    topic: 'prefix.user-dlq-topic',
                    messages: [
                        expect.objectContaining({
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                            headers: expect.objectContaining({ eventKey: 'user.deleted' }),
                        }),
                    ],
                }),
            );
        });

        it('should abandon a handler that ignores the signal after the cancel grace period', async () => {
            const handler: Mock = vi.fn(() => new Promise(() => {}));
            sut.subscribe(KafkaPersonDeletedEvent, handler);

            const handlePromise: Promise<void> = sut.handleMessage(createMessage());
            await vi.advanceTimersByTimeAsync(60000);
            expect(logger.crit).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(5000);
            await handlePromise;

            expect(logger.crit).toHaveBeenCalledTimes(1);
            expect(logger.crit).toHaveBeenCalledWith(expect.stringContaining('did not stop within 5000ms'));
            expect(producer.send).toHaveBeenCalledWith(expect.objectContaining({ topic: 'prefix.user-dlq-topic' }));
        });

        it('should return a timeout error as result if the handler is abandoned', async () => {
            const handler: Mock = vi.fn(() => new Promise(() => {}));

            const promise: Promise<Result<unknown, Error>> = sut.runHandler(handler, event);
            await vi.advanceTimersByTimeAsync(65000);
            const result: Result<unknown, Error> = await promise;

            expect(errorOf(result)).toBeInstanceOf(EventHandlerTimeoutError);
        });

        it('should treat a handler that returns after being aborted as failed', async () => {
            const handler: Mock = vi.fn(
                (_event: BaseEvent, _keepAlive: () => void, signal: AbortSignal) =>
                    new Promise((resolve: (value: unknown) => void) => {
                        signal.addEventListener('abort', () => {
                            resolve({ ok: true, value: null });
                        });
                    }),
            );

            const promise: Promise<Result<unknown, Error>> = sut.runHandler(handler, event);
            await vi.advanceTimersByTimeAsync(60000);
            const result: Result<unknown, Error> = await promise;

            expect(errorOf(result)).toBeInstanceOf(EventHandlerTimeoutError);
            expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('completed successfully'));
            expect(logger.warning).toHaveBeenCalledWith(
                expect.stringContaining('returned after being aborted, treating it as failed'),
            );
        });

        it('should not abort a handler that finishes in time', async () => {
            let receivedSignal: AbortSignal | undefined;
            const handler: Mock = vi.fn(
                (_event: BaseEvent, _keepAlive: () => void, signal: AbortSignal) =>
                    new Promise((resolve: (value: unknown) => void) => {
                        receivedSignal = signal;
                        setTimeout(() => {
                            resolve({ ok: true, value: null });
                        }, 59000);
                    }),
            );

            const promise: Promise<Result<unknown, Error>> = sut.runHandler(handler, event);
            await vi.advanceTimersByTimeAsync(59000);
            const result: Result<unknown, Error> = await promise;
            await vi.advanceTimersByTimeAsync(70000);

            expect(result).toEqual({ ok: true, value: null });
            expect(receivedSignal?.aborted).toBe(false);
            expect(logger.error).not.toHaveBeenCalled();
            expect(logger.crit).not.toHaveBeenCalled();
        });

        it('should restart the timeout when the handler calls keepAlive', async () => {
            const handler: Mock = vi.fn(
                (_event: BaseEvent, keepAlive: () => void) =>
                    new Promise((resolve: (value: unknown) => void) => {
                        setTimeout(keepAlive, 50000);
                        setTimeout(() => {
                            resolve({ ok: true, value: null });
                        }, 100000);
                    }),
            );

            const promise: Promise<Result<unknown, Error>> = sut.runHandler(handler, event);
            await vi.advanceTimersByTimeAsync(100000);
            const result: Result<unknown, Error> = await promise;

            expect(result).toEqual({ ok: true, value: null });
            expect(logger.error).not.toHaveBeenCalled();
            expect(logger.crit).not.toHaveBeenCalled();
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringMatching(
                    /^Handler for event KafkaPersonDeletedEvent with EventID: .+ is still running and called keepAlive, resetting timeout$/,
                ),
            );
        });

        it('should abort a handler at the maximum processing time even if it keeps calling keepAlive', async () => {
            let receivedSignal: AbortSignal | undefined;
            const handler: Mock = vi.fn((_event: BaseEvent, keepAlive: () => void, signal: AbortSignal) => {
                receivedSignal = signal;
                const interval: NodeJS.Timeout = setInterval(keepAlive, 50000);
                return new Promise((_resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
                    signal.addEventListener('abort', () => {
                        clearInterval(interval);
                        reject(signal.reason as Error);
                    });
                });
            });

            const promise: Promise<Result<unknown, Error>> = sut.runHandler(handler, event);
            await vi.advanceTimersByTimeAsync(284999);

            expect(receivedSignal?.aborted).toBe(false);

            await vi.advanceTimersByTimeAsync(1);
            const result: Result<unknown, Error> = await promise;

            expect(receivedSignal?.aborted).toBe(true);
            expect(errorOf(result)).toBeInstanceOf(EventHandlerTimeoutError);
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('exceeded the maximum processing time of 285000ms'),
            );
        });

        it('should not trigger the maximum processing time after the handler finished', async () => {
            const handler: Mock = vi.fn().mockResolvedValue({ ok: true, value: null });

            const result: Result<unknown, Error> = await sut.runHandler(handler, event);
            await vi.advanceTimersByTimeAsync(300000);

            expect(result).toEqual({ ok: true, value: null });
            expect(logger.error).not.toHaveBeenCalled();
        });

        it('should ignore keepAlive calls after the handler was aborted', async () => {
            let keepAliveFn: (() => void) | undefined;
            const handler: Mock = vi.fn((_event: BaseEvent, keepAlive: () => void) => {
                keepAliveFn = keepAlive;
                return new Promise(() => {});
            });

            const promise: Promise<Result<unknown, Error>> = sut.runHandler(handler, event);
            await vi.advanceTimersByTimeAsync(60000);
            keepAliveFn?.();
            await vi.advanceTimersByTimeAsync(5000);
            await promise;

            expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('called keepAlive'));
            expect(logger.error).toHaveBeenCalledTimes(1);
            expect(logger.crit).toHaveBeenCalledTimes(1);
        });

        it('should return a failure with an EventHandlerFailedError if the handler throws a non-error', async () => {
            const handler: Mock = vi.fn().mockRejectedValue('not an error');

            const result: Result<unknown, Error> = await sut.runHandler(handler, event);

            expect(errorOf(result)).toBeInstanceOf(EventHandlerFailedError);
        });

        it('should abort running handlers on shutdown and not publish them to the DLQ', async () => {
            const handler: Mock = vi.fn(
                (_event: BaseEvent, _keepAlive: () => void, signal: AbortSignal) =>
                    new Promise((_resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
                        signal.addEventListener('abort', () => {
                            reject(signal.reason as Error);
                        });
                    }),
            );
            sut.subscribe(KafkaPersonDeletedEvent, handler);

            const handled: Promise<unknown> = sut.handleMessage(createMessage()).catch((error: unknown) => error);
            await sut.onModuleDestroy();
            const error: unknown = await handled;

            expect(error).toBeInstanceOf(EventHandlerShutdownError);
            expect(producer.send).not.toHaveBeenCalled();
            expect(logger.crit).not.toHaveBeenCalled();
            expect(logger.warning).toHaveBeenCalledWith(expect.stringContaining('aborted because of shutdown'));
            expect(consumer.disconnect).toHaveBeenCalled();
        });

        it('should not abort a handler twice if the shutdown happens after the timeout', async () => {
            const handler: Mock = vi.fn(() => new Promise(() => {}));

            const promise: Promise<Result<unknown, Error>> = sut.runHandler(handler, event);
            await vi.advanceTimersByTimeAsync(60000);
            await sut.onModuleDestroy();
            await vi.advanceTimersByTimeAsync(5000);
            const result: Result<unknown, Error> = await promise;

            expect(errorOf(result)).toBeInstanceOf(EventHandlerTimeoutError);
        });

        it('should not abort handlers that already finished when shutting down', async () => {
            const handler: Mock = vi.fn();
            sut.subscribe(KafkaPersonDeletedEvent, handler);
            await sut.handleMessage(createMessage());

            await sut.onModuleDestroy();

            expect(logger.warning).not.toHaveBeenCalled();
            expect(producer.send).not.toHaveBeenCalled();
        });

        it('should not start the next message while a handler is still running', async () => {
            const order: string[] = [];
            const handler: Mock = vi.fn(
                (_event: BaseEvent, _keepAlive: () => void, signal: AbortSignal) =>
                    new Promise((_resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
                        signal.addEventListener('abort', () => {
                            setTimeout(() => {
                                order.push('handler stopped');
                                reject(signal.reason as Error);
                            }, 10);
                        });
                    }),
            );
            sut.subscribe(KafkaPersonDeletedEvent, handler);

            const first: Promise<void> = sut.handleMessage(createMessage()).then(() => {
                order.push('first message done');
            });
            await vi.advanceTimersByTimeAsync(60010);
            await first;

            expect(order).toEqual(['handler stopped', 'first message done']);
        });
    });
});
