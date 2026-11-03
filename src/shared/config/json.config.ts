import { Injectable } from '@nestjs/common';

import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { CronConfig } from './cron.config.js';
import { DataConfig } from './data.config.js';
import { DbConfig } from './db.config.js';
import { EmailConfig } from './email.config.js';
import { FeatureFlagConfig } from './featureflag.config.js';
import { FrontendConfig } from './frontend.config.js';
import { HeaderApiKeyConfig } from './headerapikey.config.js';
import { HostConfig } from './host.config.js';
import { ImportConfig } from './import.config.js';
import { ItsLearningConfig } from './itslearning.config.js';
import { KafkaConfig } from './kafka.config.js';
import { KeycloakConfig } from './keycloak.config.js';
import { LdapServerConfig } from './ldap-server.config.js';
import { LoggingConfig } from './logging.config.js';
import { OxServerConfig } from './ox-server.config.js';
import { PortalConfig } from './portal.config.js';
import { PrivacyIdeaConfig } from './privacyidea.config.js';
import { RedisConfig } from './redis.config.js';
import { SystemConfig } from './system.config.js';
import { VidisConfig } from './vidis.config.js';
import { EmailMicroserviceConfig } from './email-microservice.config.js';
import { SchulconnexConfig } from './schulconnex.config.js';

@Injectable()
export class JsonConfig {
    @ValidateNested()
    @Type(() => HostConfig)
    public readonly HOST!: HostConfig;

    @ValidateNested()
    @Type(() => FrontendConfig)
    public readonly FRONTEND!: FrontendConfig;

    @ValidateNested()
    @Type(() => DbConfig)
    public readonly DB!: DbConfig;

    @ValidateNested()
    @Type(() => KeycloakConfig)
    public readonly KEYCLOAK!: KeycloakConfig;

    @ValidateNested()
    @Type(() => LoggingConfig)
    public readonly LOGGING!: LoggingConfig;

    @ValidateNested()
    @Type(() => RedisConfig)
    public readonly REDIS!: RedisConfig;

    @ValidateNested()
    @Type(() => LdapServerConfig)
    public readonly LDAP!: LdapServerConfig;

    @ValidateNested()
    @Type(() => FeatureFlagConfig)
    public readonly FEATUREFLAG!: FeatureFlagConfig;

    @ValidateNested()
    @Type(() => DataConfig)
    public readonly DATA!: DataConfig;

    @ValidateNested()
    @Type(() => ItsLearningConfig)
    public readonly ITSLEARNING!: ItsLearningConfig;

    @ValidateNested()
    @Type(() => PrivacyIdeaConfig)
    public readonly PRIVACYIDEA!: PrivacyIdeaConfig;

    @ValidateNested()
    @Type(() => OxServerConfig)
    public readonly OX!: OxServerConfig;

    @ValidateNested()
    @Type(() => EmailConfig)
    public readonly EMAIL!: EmailConfig;

    @ValidateNested()
    @Type(() => ImportConfig)
    public readonly IMPORT!: ImportConfig;

    @ValidateNested()
    @Type(() => SystemConfig)
    public readonly SYSTEM!: SystemConfig;

    @ValidateNested()
    @Type(() => VidisConfig)
    public readonly VIDIS!: VidisConfig;

    @ValidateNested()
    @Type(() => HeaderApiKeyConfig)
    public readonly HEADER_API_KEY!: HeaderApiKeyConfig;

    @ValidateNested()
    @Type(() => KafkaConfig)
    public readonly KAFKA!: KafkaConfig;

    @ValidateNested()
    @Type(() => PortalConfig)
    public readonly PORTAL!: PortalConfig;

    @ValidateNested()
    @Type(() => CronConfig)
    public readonly CRON!: CronConfig;

    @ValidateNested()
    @Type(() => EmailMicroserviceConfig)
    public readonly EMAIL_MICROSERVICE!: EmailMicroserviceConfig;

    @ValidateNested()
    @Type(() => SchulconnexConfig)
    public readonly SCHULCONNEX!: SchulconnexConfig;
}
