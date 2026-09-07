import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { BaseEvent } from '../../../shared/events/index.js';
import { Constructor, EventHandlerType, MaybePromise } from '../types/util.types.js';
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
import { KafkaConfig } from '../../../shared/config/kafka.config.js';
import { KAFKA_INSTANCE } from '../kafka-client-provider.js';
import { EventHandlerFailedError } from '../error/handler-failed.error.js';
import { EventHandlerTimeoutError } from '../error/handler-timeout.error.js';

type Kafka = KafkaJS.Kafka;
type Consumer = KafkaJS.Consumer;
type Producer = KafkaJS.Producer;
type KafkaMessage = KafkaJS.KafkaMessage;
type EachMessagePayload = KafkaJS.EachMessagePayload;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class KafkaEventService implements OnModuleInit, OnModuleDestroy {
    private readonly handlerMap: Map<Constructor<BaseEvent>, EventHandlerType<BaseEvent>[]> = new Map();

    private readonly consumer?: Consumer;

    private producer?: Producer;

    private readonly kafkaConfig: KafkaConfig;

    public constructor(
        private readonly logger: ClassLogger,
        @Inject(KAFKA_INSTANCE) private readonly kafka: Kafka,
        configService: ConfigService<ServerConfig>,
    ) {
        this.kafkaConfig = configService.getOrThrow<KafkaConfig>('KAFKA');
        if (this.kafkaConfig.ENABLED !== true) {
            this.logger.info('Kafka is disabled');
            return;
        }
        this.consumer = this.kafka.consumer({
            'group.id': this.kafkaConfig.GROUP_ID,
            'session.timeout.ms': this.kafkaConfig.SESSION_TIMEOUT,
            'heartbeat.interval.ms': this.kafkaConfig.HEARTBEAT_INTERVAL,
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
                eachMessage: async ({
                    topic,
                    partition,
                    message,
                    heartbeat,
                }: Omit<EachMessagePayload, 'heartbeat'> & { heartbeat: () => Promise<void> }) => {
                    this.logger.info(
                        `Consuming message from topic: ${topic}, partition: ${partition}, offset: ${message.offset}, key: ${message.key?.toString()}`,
                    );
                    // Call heartbeat before and after processing, and optionally during long processing
                    await heartbeat();
                    await this.handleMessage(message, heartbeat);
                    await heartbeat();
                },
            });

            await this.producer?.connect();
        } catch (err) {
            this.logger.logUnknownAsError('Error in KafkaEventService', err);
        }
    }

    public async onModuleDestroy(): Promise<void> {
        await this.consumer?.disconnect();
        await this.producer?.disconnect();
    }

    public subscribe<Event extends BaseEvent>(eventType: Constructor<Event>, handler: EventHandlerType<Event>): void {
        const handlers: EventHandlerType<BaseEvent>[] = this.handlerMap.get(eventType) ?? [];
        handlers.push(handler as EventHandlerType<BaseEvent>);
        this.handlerMap.set(eventType, handlers);
    }

    public async handleMessage(message: KafkaMessage, heartbeat: () => Promise<void>): Promise<void> {
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
            const handlerPromises: Promise<Result<unknown>>[] = handlers.map(
                async (handler: EventHandlerType<BaseEvent>) => {
                    try {
                        const res: Result<unknown, Error> = await this.runWithTimoutAndKeepAlive(
                            handler,
                            kafkaEvent,
                            heartbeat,
                        );

                        return res;
                    } catch (err) {
                        this.logger.logUnknownAsError(`Handler failed for event ${eventClass.name}`, err);
                        return {
                            ok: false,
                            error: new EventHandlerFailedError(eventClass.name)
                        } satisfies Result<Error>;
                    }
                },
            );

            const results: PromiseSettledResult<Result<unknown>>[] = await Promise.allSettled(handlerPromises);

            const firstFailure:
                | PromiseFulfilledResult<{
                      ok: false;
                      error: Error;
                  }>
                | undefined = results.find(
                (
                    res: PromiseSettledResult<Result<unknown, Error>>,
                ): res is PromiseFulfilledResult<{ ok: false; error: Error }> =>
                    res.status === 'fulfilled' && !res.value.ok && res.value.error instanceof Error,
            );

            if (firstFailure) {
                await this.publishToDLQ(kafkaEvent, firstFailure.value.error);
            }
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
        const eventKey: KafkaEventKey | undefined = Object.keys(KafkaEventMapping).find(
            (key: string): key is KafkaEventKey =>
                isKafkaEventKey(key) && KafkaEventMapping[key]?.eventClass === event.constructor,
        );

        if (!eventKey) {
            this.logger.error(`(Standard publishing) No mapping found for event: ${event.constructor.name}`);
            return;
        }

        const topic: KafkaTopic = KafkaEventMapping[eventKey].topic;
        const topicWithPrefix: string = this.kafkaConfig.TOPIC_PREFIX + topic;
        await this.sendEvent(event, eventKey, topicWithPrefix);
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

    /*
    Must be public because otherwise writing tests that cover 100% are very hard and not worth the effort
    */
    public runWithTimoutAndKeepAlive<Event extends BaseEvent>(
        handler: EventHandlerType<BaseEvent>,
        event: Event,
        heartbeat: () => Promise<void>,
    ): Promise<Result<unknown, Error>> {
        return new Promise((resolve: (value: Result<unknown, Error> | PromiseLike<Result<unknown, Error>>) => void) => {
            const timeoutMs: number = this.kafkaConfig.SESSION_TIMEOUT - this.kafkaConfig.HEARTBEAT_INTERVAL - 2500; // To allow processing of offset commit after message before client times out
            let completed: boolean = false;

            const onTimeout = (): void => {
                if (!completed) {
                    completed = true;
                    this.logger.crit(
                        `Handler for event ${event.constructor.name} with EventID: ${event.eventID} timed out after ${timeoutMs}ms`,
                    );
                    resolve({
                        ok: false,
                        error: new EventHandlerTimeoutError<Event>(event, timeoutMs)
                    } satisfies Result<Error>);
                }
            };

            let timeout: NodeJS.Timeout = setTimeout(onTimeout, timeoutMs);

            const keepAlive = (): void => {
                if (!completed) {
                    this.logger.info(
                        `Handler for event ${event.constructor.name} with EventID: ${event.eventID} is still running and called keepAlive, resetting timeout`,
                    );
                    void heartbeat();
                    clearTimeout(timeout);
                    timeout = setTimeout(onTimeout, timeoutMs);
                }
            };

            const maybePromise: MaybePromise<void | Result<unknown, Error>> = handler(event, keepAlive);
            Promise.resolve(maybePromise)
                .then((result: Result<unknown> | void) => {
                    if (!completed) {
                        this.logger.info(
                            `Handler for event ${event.constructor.name} with EventID: ${event.eventID} completed successfully`,
                        );
                        clearTimeout(timeout);
                        completed = true;
                        resolve(result ?? ({ ok: true, value: null } satisfies Result<unknown>));
                    }
                })
                .catch((error: Error) => {
                    if (!completed) {
                        this.logger.logUnknownAsError(
                            `Handler for event ${event.constructor.name} with EventID: ${event.eventID} failed`,
                            error,
                        );
                        clearTimeout(timeout);
                        completed = true;
                        resolve({
                            ok: false,
                            error,
                        } satisfies Result<unknown>);
                    }
                });
        });
    }
}
