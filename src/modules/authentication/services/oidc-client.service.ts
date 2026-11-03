import { type FactoryProvider } from '@nestjs/common';
import { type Client, Issuer } from 'openid-client';

import { KeycloakInstanceConfig } from '../../keycloak-administration/keycloak-instance-config.js';

export const OIDC_CLIENT: symbol = Symbol();

function createClient(config: KeycloakInstanceConfig): Client {
    const internalRealmUrl: string = `${config.BASE_URL.replace(/\/$/, '')}/realms/${config.REALM_NAME}`;
    const externalRealmUrl: string = `${config.EXTERNAL_BASE_URL.replace(/\/$/, '')}/realms/${config.REALM_NAME}`;
    const TrustIssuer: Issuer = new Issuer({
        issuer: externalRealmUrl,
        authorization_endpoint: `${externalRealmUrl}/protocol/openid-connect/auth`,
        token_endpoint: `${internalRealmUrl}/protocol/openid-connect/token`,
        userinfo_endpoint: `${internalRealmUrl}/protocol/openid-connect/userinfo`,
        jwks_uri: `${internalRealmUrl}/protocol/openid-connect/certs`,
        introspection_endpoint: `${internalRealmUrl}/protocol/openid-connect/token/introspect`,
        revocation_endpoint: `${internalRealmUrl}/protocol/openid-connect/revoke`,
        end_session_endpoint: `${externalRealmUrl}/protocol/openid-connect/logout`,
    });

    return new TrustIssuer.Client({
        client_id: config.CLIENT_ID,
        client_secret: config.CLIENT_SECRET,
    });
}

export const OIDCClientProvider: FactoryProvider<Client> = {
    provide: OIDC_CLIENT,
    useFactory(config: KeycloakInstanceConfig) {
        return createClient(config);
    },
    inject: [KeycloakInstanceConfig],
};
