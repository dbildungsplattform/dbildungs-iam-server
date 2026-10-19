import { Injectable } from '@nestjs/common';

import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { DbConfig } from './db.config.js';
import { EmailConfig } from './email.config.js';
import { HostConfig } from './host.config.js';
import { LoggingConfig } from './logging.config.js';
import { HeaderApiKeyConfig } from './headerapikey.config.js';
import { EmailWebhookConfig } from './email-webhook.config.js';
import { OxEmailMicroserviceConfig } from './ox-email-microservice.config.js';
import { LdapEmailMicroserviceConfig } from './ldap-email-microservice.config.js';

@Injectable()
export class EmailAppConfig {
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
    @Type(() => LdapEmailMicroserviceConfig)
    public readonly LDAP!: LdapEmailMicroserviceConfig;

    @ValidateNested()
    @Type(() => LdapEmailMicroserviceConfig)
    public readonly LDAP_UNDI!: LdapEmailMicroserviceConfig;

    @ValidateNested()
    @Type(() => OxEmailMicroserviceConfig)
    public readonly OX!: OxEmailMicroserviceConfig;

    @ValidateNested()
    @Type(() => EmailConfig)
    public readonly EMAIL!: EmailConfig;

    @ValidateNested()
    @Type(() => EmailWebhookConfig)
    public readonly WEBHOOK!: EmailWebhookConfig;

    @ValidateNested()
    @Type(() => HeaderApiKeyConfig)
    public readonly HEADER_API_KEY!: HeaderApiKeyConfig;
}
