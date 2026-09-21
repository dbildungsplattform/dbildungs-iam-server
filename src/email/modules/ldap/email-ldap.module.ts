import { Module } from '@nestjs/common';
import { LdapClientAdapter } from './adapter/domain/ldap-client.adapter.js';
import { LdapClient } from './adapter/technical/ldap-client.js';
import { LoggerModule } from '../../../core/logging/logger.module.js';
import { EmailLdapConfigModule } from './adapter/technical/email-ldap-config.module.js';
import { LdapUndiClient } from './adapter/technical/ldap-undi-client.js';
import { LdapUndiClientAdapter } from './adapter/domain/ldap-undi-lient.adapter.js';

@Module({
    imports: [LoggerModule.register(EmailLdapModule.name), EmailLdapConfigModule],
    providers: [LdapClientAdapter, LdapUndiClientAdapter, LdapClient, LdapUndiClient],
    exports: [LdapClientAdapter, LdapUndiClientAdapter, LdapClient, LdapUndiClient],
})
export class EmailLdapModule {}
