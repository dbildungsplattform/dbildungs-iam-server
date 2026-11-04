import { type FactoryProvider } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type BaseClient, type Client, Issuer, type TokenSet } from 'openid-client';

import { ClassLogger } from '../../../core/logging/class-logger.js';
import { KeycloakInstanceConfig } from '../../keycloak-administration/keycloak-instance-config.js';

export const OIDC_CLIENT: symbol = Symbol();

export async function tryGetClient(config: KeycloakInstanceConfig): Promise<BaseClient> {
    const TrustIssuer: Issuer = await Issuer.discover(`${config.BASE_URL}/realms/${config.REALM_NAME}`);

    return new TrustIssuer.Client({
        client_id: config.CLIENT_ID,
        client_secret: config.CLIENT_SECRET,
    });
}

/*
Explanation: openid-client v5's authorization-code callback() calls this.grant() and returns the same TokenSet
after ID-token validation, so correlation stays within one request and does not depend on sticky sessions.
The WeakMap links each TokenSet instance to its attemptId without preventing garbage collection if validation
fails before cleanup.
This undocumented call-chain/object-identity dependency may break on updates; wrapping both methods is currently
the simplest option here because v5's HTTP customization hook runs before requests, not after ID-token validation.
*/
export const OIDCClientProvider: FactoryProvider<Client> = {
    provide: OIDC_CLIENT,
    async useFactory(config: KeycloakInstanceConfig, logger: ClassLogger): Promise<Client> {
        const client: BaseClient = await tryGetClient(config);
        const grant: BaseClient['grant'] = client.grant.bind(client);
        const callback: BaseClient['callback'] = client.callback.bind(client);
        const attempts: WeakMap<TokenSet, string> = new WeakMap();

        client.grant = async (...args: Parameters<BaseClient['grant']>): Promise<TokenSet> => {
            if (args[0].grant_type !== 'authorization_code') {
                return grant(...args);
            }

            const attemptId: string = randomUUID();
            logger.info(`Authorization code exchange started, attemptId: ${attemptId}, identityStatus: unknown`);

            try {
                const tokens: TokenSet = await grant(...args);
                attempts.set(tokens, attemptId);
                logger.debug(`Authorization code exchange succeeded, attemptId: ${attemptId}, identityStatus: unknown`);
                return tokens;
            } catch (error: unknown) {
                logger.error(`Authorization code exchange failed, attemptId: ${attemptId}, identityStatus: unknown`);
                throw error;
            }
        };

        client.callback = async (...args: Parameters<BaseClient['callback']>): Promise<TokenSet> => {
            const tokens: TokenSet = await callback(...args);
            const attemptId: string | undefined = attempts.get(tokens);
            if (attemptId) {
                logger.info(
                    `Authorization code exchange identity resolved, attemptId: ${attemptId}, keycloakSub: ${tokens.claims().sub}`,
                );
                attempts.delete(tokens);
            }
            return tokens;
        };

        return client;
    },
    inject: [KeycloakInstanceConfig, ClassLogger],
};
