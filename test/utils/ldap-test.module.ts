import { DynamicModule, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenericContainer, PullPolicy, StartedTestContainer, Wait } from 'testcontainers';
import { ServerConfig } from '../../src/shared/config/index.js';
import { LdapInstanceConfig } from '../../src/core/ldap/adapter/technical/ldap-instance-config.js';
import { LdapServerConfig } from '../../src/shared/config/ldap-server.config.js';

type LdapConfigTestModuleOptions = { isLdapRequired: boolean };

export class LdapTestModule implements OnModuleDestroy {
    private static ldap: Option<StartedTestContainer>;

    public static forRoot(options?: LdapConfigTestModuleOptions): DynamicModule {
        return {
            module: LdapTestModule,
            providers: [
                {
                    provide: LdapInstanceConfig,
                    useFactory: async (configService: ConfigService<ServerConfig>): Promise<LdapInstanceConfig> => {
                        const ldapConfig: LdapServerConfig = configService.getOrThrow<LdapServerConfig>('LDAP');

                        if (options?.isLdapRequired) {
                            this.ldap = await new GenericContainer('docker.io/osixia/openldap:1.5.0')
                                .withCopyDirectoriesToContainer([
                                    {
                                        source: './config/ldif',
                                        target: '/container/service/slapd/assets/config/bootstrap/ldif/custom/ldif',
                                    },
                                ])
                                .withPullPolicy(PullPolicy.defaultPolicy())
                                .withExposedPorts(389)
                                .withEnvironment({
                                    LDAP_ADMIN_PASSWORD: 'admin',
                                    LDAP_CONFIG_PASSWORD: 'config',
                                    LDAP_BASE_DN: 'dc=schule-sh,dc=de',
                                })
                                .withCommand(['--copy-service']) // '--loglevel', 'debug'
                                .withStartupTimeout(240000)
                                .withWaitStrategy(Wait.forLogMessage(/openldap | w+ slapd starting/))
                                .start();
                        }

                        const baseUrl: string = this.ldap
                            ? `ldap://${this.ldap.getHost()}:${this.ldap.getMappedPort(389)}`
                            : ldapConfig.URL;

                        return new LdapInstanceConfig(
                            baseUrl,
                            options?.isLdapRequired ? 'cn=admin,dc=schule-sh,dc=de' : ldapConfig.BIND_DN,
                            options?.isLdapRequired ? 'admin' : ldapConfig.ADMIN_PASSWORD,
                            options?.isLdapRequired ? 'dc=schule-sh,dc=de' : ldapConfig.BASE_DN,
                        );
                    },
                    inject: [ConfigService],
                },
            ],
            exports: [LdapInstanceConfig],
        };
    }

    public async onModuleDestroy(): Promise<void> {
        await LdapTestModule.ldap?.stop();
    }
}
