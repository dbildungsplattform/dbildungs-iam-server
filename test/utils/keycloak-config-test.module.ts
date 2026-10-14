import { DynamicModule, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { KeycloakInstanceConfig } from '../../src/modules/keycloak-administration/keycloak-instance-config.js';
import { KeycloakConfig, ServerConfig } from '../../src/shared/config/index.js';
import { startReusableContainer } from './testcontainer-reuse.js';

type KeycloakConfigTestModuleOptions = { isKeycloakRequired: boolean };

const SHARED_KC_CONTAINER_NAME: string = 'testcontainer-kc';

export class KeycloakConfigTestModule implements OnModuleDestroy {
    private static keycloak: Option<StartedTestContainer>;

    // One shared container per worker process; parallel workers share the same Docker container via reuse.
    private static startPromise: Option<Promise<StartedTestContainer>>;

    private static async getSharedContainer(): Promise<StartedTestContainer> {
        // Container config is constant across workers so the reuse hash matches and testcontainers deduplicates
        // to a single container instead of colliding on the fixed name.
        KeycloakConfigTestModule.startPromise ??= startReusableContainer(() =>
            new GenericContainer('quay.io/keycloak/keycloak:26.7.2-1')
                .withCopyFilesToContainer([
                    {
                        source: './config/dev-realm-spsh.json',
                        target: '/opt/keycloak/data/import/realm.json',
                    },
                ])
                .withExposedPorts(8080)
                .withEnvironment({
                    KEYCLOAK_ADMIN: 'admin',
                    KEYCLOAK_ADMIN_PASSWORD: 'admin',
                    // Referenced as ${...} placeholders by dev-realm-spsh.json; without them the realm import fails validation and Keycloak exits immediately
                    VIDIS_CLIENT_SECRET: 'irgendein-secret',
                    VIDIS_KEYCLOAK_CLIENT_ID: 'vidis-test',
                    VIDIS_REDIRECT_URI: 'https://vidis.example/*',
                    VIDIS_LOCAL_BACKCHANNEL_LOGOUT_URL: 'https://vidis.example/auth',
                    KC_NEXTCLOUD_CLIENT_ID: 'nextcloud',
                    KC_NEXTCLOUD_CLIENT_SECRET: 'irgendein-secret',
                })
                .withCommand(['start-dev', '--import-realm'])
                .withStartupTimeout(240000)
                .withReuse()
                .withName(SHARED_KC_CONTAINER_NAME)
                .start(),
        );
        KeycloakConfigTestModule.keycloak = await KeycloakConfigTestModule.startPromise;
        return KeycloakConfigTestModule.keycloak;
    }

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
                            await KeycloakConfigTestModule.getSharedContainer();
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
        // The shared, reused container is intentionally not stopped here: other test files and parallel workers
        // rely on it. It is left running for reuse and reaped by testcontainers/Docker outside the test run.
    }
}
