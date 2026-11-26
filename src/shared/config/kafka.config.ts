import { IsBoolean, IsNumber, IsOptional, IsString, ValidateIf } from 'class-validator';

type Required<T, IsRequired extends boolean> = Persisted<T, IsRequired>;

/** librdkafka default for `max.poll.interval.ms` */
export const DEFAULT_KAFKA_MAX_POLL_INTERVAL: number = 300000;

/** Default time an event handler may run (without calling keepAlive) before it is cancelled */
export const DEFAULT_KAFKA_HANDLER_TIMEOUT: number = 60000;

/** Default time a handler gets to stop after it was cancelled before it is abandoned */
export const DEFAULT_KAFKA_HANDLER_CANCEL_GRACE: number = 5000;

export class KafkaConfig<SslEnabled extends boolean = boolean> {
    @IsString()
    public readonly BROKER!: string;

    @IsString()
    public readonly TOPIC_PREFIX!: string;

    @IsString()
    public readonly USER_TOPIC!: string;

    @IsString()
    public readonly USER_DLQ_TOPIC!: string;

    @IsString()
    public readonly GROUP_ID!: string;

    @IsNumber()
    public readonly SESSION_TIMEOUT!: number;

    @IsNumber()
    public readonly HEARTBEAT_INTERVAL!: number;

    /**
     * Maximum time (ms) between two polls of the consumer, passed to librdkafka as `max.poll.interval.ms`.
     * This is the real upper limit for the processing time of a single message.
     */
    @IsOptional()
    @IsNumber()
    public readonly MAX_POLL_INTERVAL?: number;

    /**
     * Time (ms) an event handler may run before it is aborted via its AbortSignal.
     * The timer is restarted whenever the handler calls keepAlive.
     */
    @IsOptional()
    @IsNumber()
    public readonly HANDLER_TIMEOUT?: number;

    /**
     * Time (ms) an aborted handler gets to stop. After that, it is abandoned and the event is treated as failed.
     * HANDLER_TIMEOUT + HANDLER_CANCEL_GRACE must be smaller than MAX_POLL_INTERVAL.
     */
    @IsOptional()
    @IsNumber()
    public readonly HANDLER_CANCEL_GRACE?: number;

    @IsBoolean()
    public readonly ENABLED!: boolean;

    @IsBoolean()
    public readonly SSL_ENABLED!: SslEnabled;

    @ValidateIf((o: KafkaConfig) => o.SSL_ENABLED)
    @IsString()
    public readonly SSL_CA_PATH!: Required<string, SslEnabled>;

    @ValidateIf((o: KafkaConfig) => o.SSL_ENABLED)
    @IsString()
    public readonly SSL_CERT_PATH!: Required<string, SslEnabled>;

    @ValidateIf((o: KafkaConfig) => o.SSL_ENABLED)
    @IsString()
    public readonly SSL_KEY_PATH!: Required<string, SslEnabled>;
}
