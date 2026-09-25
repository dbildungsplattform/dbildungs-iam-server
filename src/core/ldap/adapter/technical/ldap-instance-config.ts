import { Injectable, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServerConfig } from '../../../../shared/config/index.js';
import { LdapServerConfig } from '../../../../shared/config/ldap-server.config.js';

@Injectable()
export class LdapInstanceConfig implements LdapServerConfig {
    public constructor(
        public URL: string,
        public BIND_DN: string,
        public ADMIN_PASSWORD: string,
        public BASE_DN: string,
        public OEFFENTLICHE_SCHULEN_DOMAIN?: string,
        public ERSATZSCHULEN_DOMAIN?: string,
        public RETRY_WRAPPER_DEFAULT_RETRIES: number = 3,
        public RETRY_WRAPPER_RETRY_DELAY_IN_MS: number = 15000,
    ) {}

    public static fromConfigService(): Provider {
        return {
            provide: LdapInstanceConfig,
            useFactory: (configService: ConfigService<ServerConfig>): LdapInstanceConfig => {
                const ldapConfig: LdapServerConfig = configService.getOrThrow<LdapServerConfig>('LDAP');

                return new LdapInstanceConfig(
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
            inject: [ConfigService],
        };
    }
}
