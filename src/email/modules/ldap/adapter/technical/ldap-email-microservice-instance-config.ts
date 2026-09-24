import { Injectable, Provider } from '@nestjs/common';
import { LdapEmailMicroserviceConfig } from '../../../../../shared/config/ldap-email-microservice.config.js';
import { EmailAppConfig } from '../../../../../shared/config/index.js';

@Injectable()
export class LdapEmailMicroserviceInstanceConfig implements LdapEmailMicroserviceConfig {
    public constructor(
        public ENABLED: boolean,
        public URL: string,
        public BIND_DN: string,
        public ADMIN_PASSWORD: string,
        public BASE_DN: string,
        public OEFFENTLICHE_SCHULEN_DOMAIN?: string,
        public ERSATZSCHULEN_DOMAIN?: string,
        public RETRY_WRAPPER_DEFAULT_RETRIES?: number,
        public RETRY_WRAPPER_RETRY_DELAY_IN_MS?: number,
    ) {}

    public static fromConfigService(): Provider {
        return {
            provide: LdapEmailMicroserviceInstanceConfig,
            useFactory: (config: EmailAppConfig): LdapEmailMicroserviceInstanceConfig => {
                const ldapConfig: LdapEmailMicroserviceConfig = config.LDAP;

                return new LdapEmailMicroserviceInstanceConfig(
                    ldapConfig.ENABLED,
                    ldapConfig.URL,
                    ldapConfig.BIND_DN,
                    ldapConfig.ADMIN_PASSWORD,
                    ldapConfig.BASE_DN,
                    ldapConfig.OEFFENTLICHE_SCHULEN_DOMAIN,
                    ldapConfig.ERSATZSCHULEN_DOMAIN,
                    ldapConfig.RETRY_WRAPPER_DEFAULT_RETRIES,
                    ldapConfig.RETRY_WRAPPER_RETRY_DELAY_IN_MS,
                );
            },
            inject: [EmailAppConfig],
        };
    }
}
