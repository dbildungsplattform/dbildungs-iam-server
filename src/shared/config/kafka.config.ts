import { IsBoolean, IsNumber, IsString, ValidateIf } from 'class-validator';

type Required<T, IsRequired extends boolean> = Persisted<T, IsRequired>;

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

    @IsBoolean()
    public readonly ENABLED!: boolean;

    @IsBoolean()
    public readonly PRODUCER_IDEMPOTENCE_ENABLED!: boolean;

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
