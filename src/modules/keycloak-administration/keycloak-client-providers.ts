import { type Provider } from '@nestjs/common';
import { KeycloakAdminClient } from '@s3pweb/keycloak-admin-client-cjs';

import { type BaseClient, type Client, Issuer, type TokenSet } from 'openid-client';
import { KeycloakInstanceConfig } from './keycloak-instance-config.js';

// Treat tokens as expired if they would expire in the next 10 seconds
const TOKEN_EXPIRE_OFFSET: number = 10;

function makeAdminClient(baseUrl: string, realmName: string, clientId: string, jsonJWKS: string): KeycloakAdminClient {
    const apiClient: KeycloakAdminClient = new KeycloakAdminClient({ baseUrl, realmName });

    const jwks: ConstructorParameters<typeof BaseClient>[1] = JSON.parse(jsonJWKS) as ConstructorParameters<
        typeof BaseClient
    >[1];
    let client: Client | undefined;
    let tokenSet: TokenSet | undefined;

    apiClient.registerTokenProvider({
        async getAccessToken() {
            if (!client) {
                const KeycloakIssuer: Issuer = await Issuer.discover(`${baseUrl}/realms/${realmName}`);
                client = new KeycloakIssuer.Client(
                    {
                        client_id: clientId,
                        token_endpoint_auth_method: 'private_key_jwt',
                    },
                    jwks,
                );
            }

            if (!tokenSet || tokenSet.expired()) {
                tokenSet = await client.grant({
                    grant_type: 'client_credentials',
                });

                // Change the expire timestamp
                if (tokenSet.expires_in) {
                    tokenSet.expires_in = tokenSet.expires_in - TOKEN_EXPIRE_OFFSET;
                }
            }

            return tokenSet.access_token;
        },
    });

    return apiClient;
}

export const KC_SERVICE_CLIENT: symbol = Symbol('kc-service-client');

export const KeycloakServiceApiClient: Provider<KeycloakAdminClient> = {
    provide: KC_SERVICE_CLIENT,
    useFactory: (config: KeycloakInstanceConfig) =>
        makeAdminClient(
            config.BASE_URL,
            config.REALM_NAME,
            config.SERVICE_CLIENT_ID,
            config.SERVICE_CLIENT_PRIVATE_JWKS,
        ),
    inject: [KeycloakInstanceConfig],
};

// For when the admin client also gets the public/private key treatment

// export const KC_ADMIN_CLIENT: symbol = Symbol('kc-admin-client');
//
// export const KeycloakAdminApiClient: Provider<KeycloakAdminClient> = {
//     provide: KC_ADMIN_CLIENT,
//     useFactory: (config: KeycloakInstanceConfig) =>
//         makeAdminClient(
//             config.BASE_URL,
//             config.REALM_NAME,
//             config.ADMIN_CLIENT_ID,
//             config.ADMIN_CLIENT_PRIVATE_KEY,
//         ),
//     inject: [KeycloakInstanceConfig],
// };
