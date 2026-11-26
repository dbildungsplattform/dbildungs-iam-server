import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { BaseEvent } from '../../../shared/events/index.js';
import { Constructor, EventHandlerType } from '../types/util.types.js';
import { ClassLogger } from '../../logging/class-logger.js';
import {
    isKafkaEventKey,
    KafkaEventKey,
    KafkaEventMapping,
    KafkaEventMappingEntry,
    KafkaTopic,
    KafkaTopicDlq,
} from '../types/kafka-event-mapping.js';
import util from 'util';
import { KafkaEvent } from '../../../shared/events/kafka-event.js';
import { ConfigService } from '@nestjs/config';
import { ServerConfig } from '../../../shared/config/server.config.js';
import {
    DEFAULT_KAFKA_HANDLER_CANCEL_GRACE,
    DEFAULT_KAFKA_HANDLER_TIMEOUT,
    DEFAULT_KAFKA_MAX_POLL_INTERVAL,
    KafkaConfig,
} from '../../../shared/config/kafka.config.js';
import { KAFKA_INSTANCE } from '../kafka-client-provider.js';
import { EventHandlerFailedError } from '../error/handler-failed.error.js';
import { EventHandlerTimeoutError } from '../error/handler-timeout.error.js';
import { EventHandlerShutdownError } from '../error/handler-shutdown.error.js';
import { InvalidKafkaConfigError } from '../error/invalid-kafka-config.error.js';

type Kafka = KafkaJS.Kafka;
type Consumer = KafkaJS.Consumer;
type Producer = KafkaJS.Producer;
type KafkaMessage = KafkaJS.KafkaMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class KafkaEventService implements OnModuleInit, OnModuleDestroy {
    private readonly handlerMap: Map<Constructor<BaseEvent>, EventHandlerType<BaseEvent>[]> = new Map();

    private readonly consumer?: Consumer;

    private producer?: Producer;

    private readonly kafkaConfig: KafkaConfig;

    private readonly maxPollIntervalMs: number;

    private readonly handlerTimeoutMs: number;

    private readonly handlerCancelGraceMs: number;

    private readonly runningHandlers: Map<symbol, () => void> = new Map();

    public constructor(
        private readonly logger: ClassLogger,
        @Inject(KAFKA_INSTANCE) private readonly kafka: Kafka,
        configService: ConfigService<ServerConfig>,
    ) {
        this.kafkaConfig = configService.getOrThrow<KafkaConfig>('KAFKA');
        this.maxPollIntervalMs = this.kafkaConfig.MAX_POLL_INTERVAL ?? DEFAULT_KAFKA_MAX_POLL_INTERVAL;
        this.handlerTimeoutMs = this.kafkaConfig.HANDLER_TIMEOUT ?? DEFAULT_KAFKA_HANDLER_TIMEOUT;
        this.handlerCancelGraceMs = this.kafkaConfig.HANDLER_CANCEL_GRACE ?? DEFAULT_KAFKA_HANDLER_CANCEL_GRACE;
        if (this.kafkaConfig.ENABLED !== true) {
            this.logger.info('Kafka is disabled');
            return;
        }
        if (this.handlerTimeoutMs + this.handlerCancelGraceMs >= this.maxPollIntervalMs) {
            throw new InvalidKafkaConfigError(
                `HANDLER_TIMEOUT (${this.handlerTimeoutMs}ms) + HANDLER_CANCEL_GRACE (${this.handlerCancelGraceMs}ms) must be smaller than MAX_POLL_INTERVAL (${this.maxPollIntervalMs}ms)`,
            );
        }
        this.consumer = this.kafka.consumer({
            'group.id': this.kafkaConfig.GROUP_ID,
            'session.timeout.ms': this.kafkaConfig.SESSION_TIMEOUT,
            'heartbeat.interval.ms': this.kafkaConfig.HEARTBEAT_INTERVAL,
            'max.poll.interval.ms': this.maxPollIntervalMs,
            'allow.auto.create.topics': false,
            // The server is very strict about open connections and will disconnect the producers after 5000ms of inactivity
            'log.connection.close': false,
        });
        this.producer = this.kafka.producer({
            'allow.auto.create.topics': false,
            // The server is very strict about open connections and will disconnect the producers after 5000ms of inactivity
            'log.connection.close': false,
        });
    }

    public async onModuleInit(): Promise<void> {
        try {
            if (this.kafkaConfig.ENABLED !== true) {
                this.logger.info('Kafka is disabled');
                return;
            }

            this.logger.info('Connecting to Kafka');
            await this.consumer?.connect();

            const topics: Set<string> = this.getTopicSetWithPrefixFromMappings();
            await this.consumer?.subscribe({ topics: Array.from(topics) });

            await this.consumer?.run({
                eachMessage: async ({ topic, partition, message }: KafkaJS.EachMessagePayload) => {
                    this.logger.info(
                        `Consuming message from topic: ${topic}, partition: ${partition}, offset: ${message.offset}, key: ${message.key?.toString()}`,
                    );
                    await this.handleMessage(message);
                },
            });

            await this.producer?.connect();
        } catch (err) {
            this.logger.logUnknownAsError('Error in KafkaEventService', err);
        }
    }

    public async onModuleDestroy(): Promise<void> {
        for (const abortHandler of this.runningHandlers.values()) {
            abortHandler();
        }
        await this.consumer?.disconnect();
        await this.producer?.disconnect();
    }

    public subscribe<Event extends BaseEvent>(eventType: Constructor<Event>, handler: EventHandlerType<Event>): void {
        const handlers: EventHandlerType<BaseEvent>[] = this.handlerMap.get(eventType) ?? [];
        handlers.push(handler as EventHandlerType<BaseEvent>);
        this.handlerMap.set(eventType, handlers);
    }

    public async handleMessage(message: KafkaMessage): Promise<void> {
        const eventKey: string | undefined = message.headers?.['eventKey']?.toString();

        if (!eventKey) {
            this.logger.error('Event type header is missing');
            return;
        }
        if (!isKafkaEventKey(eventKey)) {
            this.logger.error(`Event type in header: ${eventKey} is not a valid KafkaEventKey`);
            return;
        }

        const mappingEntry: KafkaEventMappingEntry = KafkaEventMapping[eventKey] satisfies KafkaEventMappingEntry;
        const { eventClass }: { eventClass: Constructor<BaseEvent & KafkaEvent> } = mappingEntry;

        const json: string | undefined = message.value?.toString();
        if (!json) {
            this.logger.error('Message value is empty or undefined');
            return;
        }

        let eventData: Record<string, unknown>;
        try {
            const parsed: unknown = JSON.parse(json);
            if (!isRecord(parsed)) {
                this.logger.error('Parsed Kafka message is not a valid object');
                return;
            }
            eventData = parsed;
        } catch (error) {
            this.logger.logUnknownAsError('Failed to parse Kafka message', error);
            return;
        }

        const kafkaEvent: BaseEvent & KafkaEvent = Object.assign(new eventClass(), eventData);
        const handlers: EventHandlerType<BaseEvent>[] | undefined = this.handlerMap.get(eventClass);

        if (handlers?.length) {
            this.logger.info(`Handling event: ${eventClass.name} with ${handlers.length} handlers`);
            const results: Result<unknown, Error>[] = await Promise.all(
                handlers.map((handler: EventHandlerType<BaseEvent>) => this.runHandler(handler, kafkaEvent)),
            );
            const failures: Error[] = results.flatMap((res: Result<unknown, Error>) => (res.ok ? [] : [res.error]));
            await this.handleHandlerFailures(kafkaEvent, failures);
        }
    }

    private async handleHandlerFailures(event: BaseEvent & KafkaEvent, failures: Error[]): Promise<void> {
        const shutdownError: Error | undefined = failures.find(
            (error: Error) => error instanceof EventHandlerShutdownError,
        );
        if (shutdownError) {
            this.logger.warning(
                `Handling of event ${event.constructor.name} with EventID: ${event.eventID} was aborted because of shutdown`,
            );
            throw shutdownError;
        }

        const firstFailure: Error | undefined = failures[0];
        if (firstFailure) {
            await this.publishToDLQ(event, firstFailure);
        }
    }

    private async sendEvent(
        event: KafkaEvent,
        eventKey: string,
        topic: string,
        additionalHeaders: Record<string, string> = {},
    ): Promise<void> {
        const eventType: string | undefined = event.constructor.name;
        const headers: Record<string, string> = { eventKey, ...additionalHeaders };

        this.logger.info(`Publishing ${eventType} to Kafka on topic ${topic}`);
        try {
            await this.producer?.send({
                topic,
                messages: [{ key: event.kafkaKey, value: JSON.stringify(event), headers }],
            });
        } catch (err) {
            this.logger.logUnknownAsError(`Error publishing event to Kafka on topic ${topic}`, err);
        }
    }

    public async publish(event: KafkaEvent): Promise<void> {
        const eventKey: KafkaEventKey | undefined = this.findEventKey(event);

        if (!eventKey) {
            this.logger.error(`(Standard publishing) No mapping found for event: ${event.constructor.name}`);
            return;
        }

        const topic: KafkaTopic = KafkaEventMapping[eventKey].topic;
        const topicWithPrefix: string = this.kafkaConfig.TOPIC_PREFIX + topic;
        await this.sendEvent(event, eventKey, topicWithPrefix);
    }

    public async publishMultiple(events: KafkaEvent[]): Promise<void> {
        const messagesByTopic: Map<string, KafkaJS.Message[]> = new Map();

        for (const event of events) {
            const eventKey: KafkaEventKey | undefined = this.findEventKey(event);
            if (!eventKey) {
                this.logger.error(`(Batch publishing) No mapping found for event: ${event.constructor.name}`);
                continue;
            }

            const topicWithPrefix: string = this.kafkaConfig.TOPIC_PREFIX + KafkaEventMapping[eventKey].topic;
            const messages: KafkaJS.Message[] = messagesByTopic.get(topicWithPrefix) ?? [];
            messages.push({ key: event.kafkaKey, value: JSON.stringify(event), headers: { eventKey } });
            messagesByTopic.set(topicWithPrefix, messages);
        }

        if (messagesByTopic.size === 0) {
            return;
        }

        const topicMessages: KafkaJS.TopicMessages[] = [...messagesByTopic].map(
            ([topic, messages]: [string, KafkaJS.Message[]]) => ({ topic, messages }),
        );
        this.logger.info(`Publishing ${events.length} events to Kafka in one batch`);
        try {
            await this.producer?.sendBatch({ topicMessages });
        } catch (err) {
            this.logger.logUnknownAsError(`Error publishing event batch to Kafka`, err);
        }
    }

    private findEventKey(event: KafkaEvent): KafkaEventKey | undefined {
        return Object.keys(KafkaEventMapping).find(
            (key: string): key is KafkaEventKey =>
                isKafkaEventKey(key) && KafkaEventMapping[key]?.eventClass === event.constructor,
        );
    }

    public async publishToDLQ(event: KafkaEvent, error: Error): Promise<void> {
        const eventKey: KafkaEventKey | undefined = Object.keys(KafkaEventMapping).find(
            (key: string): key is KafkaEventKey =>
                isKafkaEventKey(key) && KafkaEventMapping[key]?.eventClass === event.constructor,
        );
        if (!eventKey) {
            this.logger.error(`(DLQ publishing) No mapping found for event: ${event.constructor.name}`);
            return;
        }

        const topicDlq: KafkaTopicDlq = KafkaEventMapping[eventKey].topicDlq;
        const topicWithPrefix: string = this.kafkaConfig.TOPIC_PREFIX + topicDlq;
        const errorString: string = util.inspect(error);

        await this.sendEvent(event, eventKey, topicWithPrefix, { error: errorString });
    }

    private getTopicSetWithPrefixFromMappings(): Set<string> {
        const topics: Set<string> = new Set<string>();
        for (const { topic } of Object.values(KafkaEventMapping)) {
            topics.add(this.kafkaConfig.TOPIC_PREFIX + topic);
        }
        return topics;
    }

    public runHandler<Event extends BaseEvent>(
        handler: EventHandlerType<BaseEvent>,
        event: Event,
    ): Promise<Result<unknown, Error>> {
        return new Promise((resolve: (value: Result<unknown, Error>) => void) => {
            const eventName: string = event.constructor.name;
            const description: string = `Handler for event ${eventName} with EventID: ${event.eventID}`;
            const controller: AbortController = new AbortController();
            const handlerToken: symbol = Symbol(description);
            let timeoutTimer: NodeJS.Timeout | undefined;
            let abandonTimer: NodeJS.Timeout | undefined;

            const finish = (result: Result<unknown, Error>): void => {
                clearTimeout(timeoutTimer);
                clearTimeout(abandonTimer);
                this.runningHandlers.delete(handlerToken);
                resolve(result);
            };

            const abort = (reason: Error): void => {
                if (controller.signal.aborted) {
                    return;
                }
                clearTimeout(timeoutTimer);
                controller.abort(reason);
                abandonTimer = setTimeout(() => {
                    this.logger.crit(
                        `${description} did not stop within ${this.handlerCancelGraceMs}ms after being aborted and is abandoned`,
                    );
                    finish({ ok: false, error: reason });
                }, this.handlerCancelGraceMs);
            };

            const abortOnShutdown = (): void => abort(new EventHandlerShutdownError(eventName));

            const startTimeout = (): void => {
                clearTimeout(timeoutTimer);
                timeoutTimer = setTimeout(() => {
                    this.logger.error(`${description} timed out after ${this.handlerTimeoutMs}ms, aborting it`);
                    abort(new EventHandlerTimeoutError<Event>(event, this.handlerTimeoutMs));
                }, this.handlerTimeoutMs);
            };

            const keepAlive = (): void => {
                if (!controller.signal.aborted) {
                    this.logger.info(`${description} is still running and called keepAlive, resetting timeout`);
                    startTimeout();
                }
            };

            const execute = async (): Promise<Result<unknown, Error>> => {
                try {
                    const result: Result<unknown> | void = await handler(event, keepAlive, controller.signal);
                    if (!controller.signal.aborted) {
                        this.logger.info(`${description} completed successfully`);
                        return result ?? ({ ok: true, value: null } satisfies Result<unknown>);
                    }
                    this.logger.warning(`${description} returned after being aborted, treating it as failed`);
                } catch (error) {
                    const aborted: boolean = controller.signal.aborted;
                    this.logger.logUnknownAsError(
                        aborted ? `${description} failed after being aborted` : `${description} failed`,
                        error,
                    );
                    if (!aborted) {
                        return {
                            ok: false,
                            error: error instanceof Error ? error : new EventHandlerFailedError(eventName),
                        };
                    }
                }
                // Reached only if aborted: the event was not (reliably) processed completely, whatever the handler returned
                return { ok: false, error: controller.signal.reason as Error };
            };

            this.runningHandlers.set(handlerToken, abortOnShutdown);
            startTimeout();
            void execute().then(finish);
        });
    }
}
