import { Injectable, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LdapServerConfig } from '../../../../shared/config/ldap-server.config.js';
import { ServerConfig } from '../../../../shared/config/index.js';

@Injectable()
export class LdapInstanceConfig implements LdapServerConfig {
    public constructor(
        public URL: string,
        public BIND_DN: string,
        public ADMIN_PASSWORD: string,
        public BASE_DN: string,
        public RETRY_WRAPPER_DEFAULT_RETRIES?: number,
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
                    ldapConfig.RETRY_WRAPPER_DEFAULT_RETRIES,
                );
            },
            inject: [ConfigService],
        };
    }
}
