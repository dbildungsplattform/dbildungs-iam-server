/* eslint-disable no-await-in-loop */
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaConfig } from '../../../shared/config/kafka.config.js';
import { EventOutboxConfig } from '../../../shared/config/event-outbox.config.js';
import { ServerConfig } from '../../../shared/config/server.config.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { UnknownOutboxEventKeyError } from '../error/unknown-outbox-event-key.error.js';
import { KafkaEventService } from '../services/kafka-event.service.js';
import { isKafkaEventKey } from '../types/kafka-event-mapping.js';

type OutboxRow = {
    id: string;
    event_key: string;
    kafka_key: string | null;
    payload: string;
};

// Pod-local poller. Multiple pods are safe: FOR UPDATE SKIP LOCKED makes each row be claimed by one pod at a time.
@Injectable()
export class EventOutboxPublisher implements OnModuleInit, OnModuleDestroy {
    private timer?: NodeJS.Timeout;

    private running: boolean = false;

    private readonly kafkaEnabled: boolean;

    private readonly pollIntervalMs: number;

    private readonly batchSize: number;

    public constructor(
        private readonly logger: ClassLogger,
        private readonly em: EntityManager,
        private readonly kafkaEventService: KafkaEventService,
        configService: ConfigService<ServerConfig>,
    ) {
        this.kafkaEnabled = configService.getOrThrow<KafkaConfig>('KAFKA').ENABLED;
        const outboxConfig: EventOutboxConfig = configService.getOrThrow<EventOutboxConfig>('EVENT_OUTBOX');
        this.pollIntervalMs = outboxConfig.POLL_INTERVAL_MS;
        this.batchSize = outboxConfig.BATCH_SIZE;
    }

    public onModuleInit(): void {
        if (!this.kafkaEnabled) {
            return;
        }
        this.timer = setInterval(() => {
            this.publishPending().catch((err: unknown) =>
                this.logger.logUnknownAsError('Event outbox poll failed', err),
            );
        }, this.pollIntervalMs);
        this.timer.unref();
    }

    public onModuleDestroy(): void {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    public async publishPending(): Promise<number> {
        if (this.running) {
            return 0;
        }
        this.running = true;
        try {
            return await this.em.transactional((tx: EntityManager) => this.publishBatch(tx));
        } catch (err) {
            this.logger.logUnknownAsError('Event outbox publishing failed', err);
            return 0;
        } finally {
            this.running = false;
        }
    }

    private async publishBatch(tx: EntityManager): Promise<number> {
        const rows: OutboxRow[] = await tx.execute<OutboxRow[]>(
            'select id, event_key, kafka_key, payload from event_outbox where published_at is null order by created_at limit ? for update skip locked',
            [this.batchSize],
        );

        for (const row of rows) {
            await this.publishRow(tx, row);
        }

        return rows.length;
    }

    // No dead-letter handling: a failing row stays unpublished and is retried on every poll. attempts and last_error show failures.
    // Delivery is at-least-once (a row can be sent again if the update after a successful send fails), so consumers must be idempotent.
    private async publishRow(tx: EntityManager, row: OutboxRow): Promise<void> {
        try {
            if (!isKafkaEventKey(row.event_key)) {
                throw new UnknownOutboxEventKeyError(row.event_key);
            }
            await this.kafkaEventService.sendOutboxMessage(row.event_key, row.kafka_key ?? undefined, row.payload);
            await tx.execute('update event_outbox set published_at = now(), attempts = attempts + 1 where id = ?', [
                row.id,
            ]);
        } catch (err) {
            this.logger.logUnknownAsError(`Failed to publish outbox event ${row.id}`, err);
            const message: string = err instanceof Error ? err.message : String(err);
            await tx.execute('update event_outbox set attempts = attempts + 1, last_error = ? where id = ?', [
                message,
                row.id,
            ]);
        }
    }
}
