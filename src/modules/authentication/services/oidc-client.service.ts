import { type FactoryProvider } from '@nestjs/common';
import { type BaseClient, type Client, Issuer } from 'openid-client';

import { KeycloakInstanceConfig } from '../../keycloak-administration/keycloak-instance-config.js';

export const OIDC_CLIENT: symbol = Symbol();

export async function tryGetClient(config: KeycloakInstanceConfig): Promise<BaseClient> {
    const TrustIssuer: Issuer = await Issuer.discover(`${config.BASE_URL}/realms/${config.REALM_NAME}`);

    return new TrustIssuer.Client({
        client_id: config.CLIENT_ID,
        client_secret: config.CLIENT_SECRET,
    });
}

export const OIDCClientProvider: FactoryProvider<Client> = {
    provide: OIDC_CLIENT,
    async useFactory(config: KeycloakInstanceConfig) {
        return tryGetClient(config);
    },
    inject: [KeycloakInstanceConfig],
};
