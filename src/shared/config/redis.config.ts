import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import { RedisSentinelNodeConfig } from './redis-sentinel-node.config.js';

export class RedisConfig {
    @ValidateIf((config: RedisConfig) => !config.SENTINEL_ENABLED)
    @IsString()
    @IsNotEmpty()
    public readonly HOST!: string;

    @ValidateIf((config: RedisConfig) => !config.SENTINEL_ENABLED)
    @IsInt()
    @Min(1024)
    @Max(10000)
    public readonly PORT!: number;

    @IsString()
    @IsNotEmpty()
    public readonly USERNAME!: string;

    @IsString()
    @IsNotEmpty()
    public readonly PASSWORD!: string;

    @IsBoolean()
    @IsNotEmpty()
    public readonly USE_TLS!: boolean;

    @IsOptional()
    @IsString()
    // PEM format
    public readonly PRIVATE_KEY?: string;

    @IsOptional()
    @IsString()
    // PEM format
    public readonly CERT_CHAINS?: string;

    @IsOptional()
    @IsString()
    public readonly CERTIFICATE_AUTHORITIES?: string;

    @IsOptional()
    @IsBoolean()
    public readonly CLUSTERED?: boolean;

    @IsOptional()
    @IsBoolean()
    public readonly SENTINEL_ENABLED?: boolean;

    @ValidateIf((config: RedisConfig) => config.SENTINEL_ENABLED === true)
    @IsString()
    @IsNotEmpty()
    public readonly SENTINEL_MASTER_NAME?: string;

    @ValidateIf((config: RedisConfig) => config.SENTINEL_ENABLED === true)
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => RedisSentinelNodeConfig)
    public readonly SENTINEL_NODES?: RedisSentinelNodeConfig[];

    @IsOptional()
    @IsBoolean()
    public readonly SENTINEL_USE_TLS?: boolean;

    @IsOptional()
    @IsString()
    public readonly SENTINEL_USERNAME?: string;

    @IsOptional()
    @IsString()
    public readonly SENTINEL_PASSWORD?: string;
}
