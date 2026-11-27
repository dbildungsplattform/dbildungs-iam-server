import { Injectable } from '@nestjs/common';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { HostConfig } from './host.config.js';
import { DbConfig } from './db.config.js';
import { LoggingConfig } from './logging.config.js';
import { EmailMicroserviceConfig } from './email-microservice.config.js';
import { HeaderApiKeyConfig } from './headerapikey.config.js';
import { RedisConfig } from './redis.config.js';

@Injectable()
export class KeycloakExternalDataAppConfig {
    @ValidateNested()
    @Type(() => HostConfig)
    public readonly HOST!: HostConfig;

    @ValidateNested()
    @Type(() => LoggingConfig)
    public readonly LOGGING!: LoggingConfig;

    @ValidateNested()
    @Type(() => DbConfig)
    public readonly DB!: DbConfig;

    @ValidateNested()
    @Type(() => RedisConfig)
    public readonly REDIS!: RedisConfig;

    @ValidateNested()
    @Type(() => HeaderApiKeyConfig)
    public readonly HEADER_API_KEY!: HeaderApiKeyConfig;

    @ValidateNested()
    @Type(() => EmailMicroserviceConfig)
    public readonly EMAIL_MICROSERVICE!: EmailMicroserviceConfig;
}
