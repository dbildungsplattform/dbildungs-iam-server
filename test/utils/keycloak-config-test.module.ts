import { DynamicModule, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { KeycloakInstanceConfig } from '../../src/modules/keycloak-administration/keycloak-instance-config.js';
import { KeycloakConfig, ServerConfig } from '../../src/shared/config/index.js';

type KeycloakConfigTestModuleOptions = { isKeycloakRequired: boolean };

export class KeycloakConfigTestModule implements OnModuleDestroy {
    private static keycloak: Option<StartedTestContainer>;

    public static forRoot(options?: KeycloakConfigTestModuleOptions): DynamicModule {
        return {
            module: KeycloakConfigTestModule,
            global: true,
            providers: [
                {
                    provide: KeycloakInstanceConfig,
                    useFactory: async (configService: ConfigService<ServerConfig>): Promise<KeycloakInstanceConfig> => {
                        const keycloakConfig: KeycloakConfig = configService.getOrThrow<KeycloakConfig>('KEYCLOAK');

                        if (options?.isKeycloakRequired) {
                            this.keycloak = await new GenericContainer('quay.io/keycloak/keycloak:26.7.2-1')
                                .withCopyFilesToContainer([
                                    {
                                        source: './config/dev-realm-spsh.json',
                                        target: '/opt/keycloak/data/import/realm.json',
                                    },
                                ])
                                .withExposedPorts(8080)
                                .withEnvironment({ KEYCLOAK_ADMIN: 'admin', KEYCLOAK_ADMIN_PASSWORD: 'admin' })
                                .withCommand(['start-dev', '--import-realm'])
                                .withStartupTimeout(240000)
                                .withName(`testcontainer-kc-${randomInt(0, 10000)}`)
                                .start();
                        }

                        const baseUrl: string = this.keycloak
                            ? `http://${this.keycloak.getHost()}:${this.keycloak.getFirstMappedPort()}`
                            : keycloakConfig.BASE_URL;

                        return new KeycloakInstanceConfig(
                            baseUrl,
                            keycloakConfig.EXTERNAL_BASE_URL,
                            keycloakConfig.ADMIN_REALM_NAME,
                            keycloakConfig.ADMIN_CLIENT_ID,
                            keycloakConfig.ADMIN_SECRET,
                            keycloakConfig.SERVICE_CLIENT_ID,
                            keycloakConfig.SERVICE_CLIENT_PRIVATE_JWKS,
                            keycloakConfig.REALM_NAME,
                            keycloakConfig.CLIENT_ID,
                            keycloakConfig.CLIENT_SECRET,
                            keycloakConfig.TEST_CLIENT_ID,
                        );
                    },
                    inject: [ConfigService],
                },
            ],
            exports: [KeycloakInstanceConfig],
        };
    }

    public async onModuleDestroy(): Promise<void> {
        await KeycloakConfigTestModule.keycloak?.stop();
    }
}
