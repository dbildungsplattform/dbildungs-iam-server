import { Test, type TestingModule } from '@nestjs/testing';
import { type Client } from 'openid-client';

import { KeycloakInstanceConfig } from '../../keycloak-administration/keycloak-instance-config.js';
import { OIDCClientProvider, OIDC_CLIENT } from './oidc-client.service.js';

describe('OIDCClientProvider', () => {
    let module: TestingModule;
    let client: Client;
    const config: KeycloakInstanceConfig = new KeycloakInstanceConfig(
        'http://127.0.0.1:1/',
        'https://keycloak.example.com/',
        'admin',
        'admin-client',
        'admin-secret',
        'service-client',
        '{"keys":[]}',
        'SPSH',
        'spsh',
        'client-secret',
        'test-client',
    );

    beforeEach(async () => {
        module = await Test.createTestingModule({
            providers: [OIDCClientProvider, { provide: KeycloakInstanceConfig, useValue: config }],
        }).compile();
        client = module.get<Client>(OIDC_CLIENT);
    });

    afterEach(async () => {
        await module.close();
    });

    it('should initialize without discovery when Keycloak is unavailable', () => {
        expect(client).toBeDefined();
        expect(client.metadata.client_id).toBe('spsh');
        expect(client.metadata.client_secret).toBe('client-secret');
    });

    it('should use the external issuer and browser endpoints', () => {
        expect(client.issuer.metadata).toMatchObject({
            issuer: 'https://keycloak.example.com/realms/SPSH',
            authorization_endpoint: 'https://keycloak.example.com/realms/SPSH/protocol/openid-connect/auth',
            end_session_endpoint: 'https://keycloak.example.com/realms/SPSH/protocol/openid-connect/logout',
        });
    });

    it('should use internal endpoints for backend requests', () => {
        expect(client.issuer.metadata).toMatchObject({
            token_endpoint: 'http://127.0.0.1:1/realms/SPSH/protocol/openid-connect/token',
            userinfo_endpoint: 'http://127.0.0.1:1/realms/SPSH/protocol/openid-connect/userinfo',
            jwks_uri: 'http://127.0.0.1:1/realms/SPSH/protocol/openid-connect/certs',
            introspection_endpoint: 'http://127.0.0.1:1/realms/SPSH/protocol/openid-connect/token/introspect',
            revocation_endpoint: 'http://127.0.0.1:1/realms/SPSH/protocol/openid-connect/revoke',
        });
    });
});
