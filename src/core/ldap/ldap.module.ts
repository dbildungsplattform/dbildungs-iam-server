import { Module } from '@nestjs/common';
import { OrganisationModule } from '../../modules/organisation/organisation.module.js';
import { PersonModule } from '../../modules/person/person.module.js';
import { PersonenKontextModule } from '../../modules/personenkontext/personenkontext.module.js';
import { RolleModule } from '../../modules/rolle/rolle.module.js';
import { LoggerModule } from '../logging/logger.module.js';
import { LdapAdapter } from './adapter/domain/ldap.adapter.js';
import { LdapClient } from './adapter/technical/ldap-client.js';
import { LdapConfigModule } from './adapter/technical/ldap-config.module.js';
import { LdapEventHandler } from './domain/ldap-event-handler.js';
import { LdapSyncEventHandler } from './domain/ldap-sync-event-handler.js';

@Module({
    imports: [
        LoggerModule.register(LdapModule.name),
        LdapConfigModule,
        RolleModule,
        OrganisationModule,
        PersonModule,
        PersonenKontextModule,
    ],
    providers: [LdapEventHandler, LdapSyncEventHandler, LdapAdapter, LdapClient],
    exports: [LdapEventHandler, LdapSyncEventHandler, LdapAdapter, LdapClient],
})
export class LdapModule {}
