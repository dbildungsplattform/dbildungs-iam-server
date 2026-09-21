import { Module } from '@nestjs/common';
import { LdapEmailMicroserviceInstanceConfig } from './ldap-email-microservice-instance-config.js';
import { LdapUndiEmailMicroserviceInstanceConfig } from './ldap-undi-email-microservice-instance-config.js';

@Module({
    providers: [
        LdapEmailMicroserviceInstanceConfig.fromConfigService(),
        LdapUndiEmailMicroserviceInstanceConfig.fromConfigService(),
    ],
    exports: [LdapEmailMicroserviceInstanceConfig, LdapUndiEmailMicroserviceInstanceConfig],
})
export class EmailLdapConfigModule {}
