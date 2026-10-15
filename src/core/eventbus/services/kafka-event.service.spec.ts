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
import { KAFKA_INSTANCE } from '../kafka-client-provider.js';
import { inspect } from 'util';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';

type Kafka = KafkaJS.Kafka;
type Consumer = KafkaJS.Consumer;
type Producer = KafkaJS.Producer;
type KafkaMessage = KafkaJS.KafkaMessage;
type EachMessageHandler = KafkaJS.EachMessageHandler;
type ConsumerRunConfig = KafkaJS.ConsumerRunConfig;
type EachMessagePayload = KafkaJS.EachMessagePayload;

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

        producer = { connect: vi.fn(), disconnect: vi.fn(), send: vi.fn() } as unknown as DeepMocked<Producer>;
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

    it('should log crit and resolve with timeout error if handler times out', async () => {
        vi.useFakeTimers();
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from(JSON.stringify(new TestEvent())),
            headers: { eventKey: 'user.deleted' },
        } as unknown as KafkaMessage);
        const handler: Mock = vi.fn(() => new Promise(() => {}));
        sut.subscribe(KafkaPersonDeletedEvent, handler);

        const handlePromise: Promise<void> = sut.handleMessage(message, () => Promise.resolve());
        vi.runOnlyPendingTimers();
        await Promise.resolve();

        expect(handlePromise).toBeDefined();
        expect(logger.crit).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it('should handle message correctly', async () => {
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from(JSON.stringify(new TestEvent())),
            headers: { eventKey: 'user.deleted' },
        } as unknown as KafkaMessage);

        const handler: Mock = vi.fn();
        sut.subscribe(KafkaPersonDeletedEvent, handler);

        await sut.handleMessage(message, () => Promise.resolve());

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

        await sut.handleMessage(message, () => Promise.resolve());

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

        await sut.handleMessage(message, () => Promise.resolve());

        expect(logger.error).toHaveBeenCalledWith('Event type header is missing');
    });

    it('should log error if event type is unknown', async () => {
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from(JSON.stringify(new TestEvent())),
            headers: { eventKey: 'UnknownEvent' },
        } as unknown as KafkaMessage);

        await sut.handleMessage(message, () => Promise.resolve());

        expect(logger.error).toHaveBeenCalledWith('Event type in header: UnknownEvent is not a valid KafkaEventKey');
    });

    it('should log error if parsed kafka message is not valid', async () => {
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from(JSON.stringify([{ invalid: 'invalid' }])),
            headers: { eventKey: 'user.deleted' },
        } as unknown as KafkaMessage);

        await sut.handleMessage(message, () => Promise.resolve());

        expect(logger.error).toHaveBeenCalledWith('Parsed Kafka message is not a valid object');
    });

    it('should log error if parsing kafka message throws error', async () => {
        const message: DeepMocked<KafkaMessage> = vi.mockObject<KafkaMessage>({
            key: Buffer.from('test'),
            value: Buffer.from('{ invalidJson: '),
            headers: { eventKey: 'user.deleted' },
        } as unknown as KafkaMessage);
        await sut.handleMessage(message, () => Promise.resolve());

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

        await sut.handleMessage(message, () => Promise.resolve());

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
        await sut.handleMessage(message, () => Promise.resolve());
        expect(logger.logUnknownAsError).toHaveBeenCalledWith(
            'Handler failed for event KafkaPersonDeletedEvent',
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

        await sut.handleMessage(message, () => Promise.resolve());

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

        await sut.handleMessage(message, () => Promise.resolve());
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
            heartbeat: vi.fn(),
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

        expect(handleMessageSpy).toHaveBeenCalled();
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

    it('should call logger.info when keepAlive is invoked in handler', async () => {
        vi.useFakeTimers();
        const event: KafkaPersonDeletedEvent = new KafkaPersonDeletedEvent('test', 'test');

        // eslint-disable-next-line @typescript-eslint/typedef
        const handler: Mock = vi.fn((_, keepAlive: () => void) => {
            setTimeout(() => {
                keepAlive();
            }, 1000);

            return new Promise((resolve: (value: unknown) => void) => {
                setTimeout(() => {
                    resolve({ ok: true, value: null });
                }, 2000);
            });
        });

        const promise: Promise<Result<unknown, Error>> = sut.runWithTimoutAndKeepAlive(handler, event, () =>
            Promise.resolve(),
        );

        vi.advanceTimersByTime(2000);
        await promise;
        expect(logger.info).toHaveBeenCalledWith(
            expect.stringMatching(
                /^Handler for event KafkaPersonDeletedEvent with EventID: .+ is still running and called keepAlive, resetting timeout$/,
            ),
        );
        vi.useRealTimers();
    });
});
