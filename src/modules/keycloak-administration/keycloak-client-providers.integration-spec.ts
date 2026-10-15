import { Test, type TestingModule } from '@nestjs/testing';
import { type KeycloakAdminClient } from '@s3pweb/keycloak-admin-client-cjs';
import { TokenSet } from 'openid-client';
import { type Mock } from 'vitest';

import { ConfigTestModule, KeycloakConfigTestModule } from '../../../test/utils/index.js';
import { KC_SERVICE_CLIENT, KeycloakServiceApiClient } from './keycloak-client-providers.js';

const tokenSetExpiredSpy: Mock<() => boolean> = vi.spyOn(TokenSet.prototype, 'expired');

describe('Keycloak API Clients', () => {
    let module: TestingModule;

    let serviceClient: KeycloakAdminClient;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, KeycloakConfigTestModule.forRoot({ isKeycloakRequired: true })],
            providers: [KeycloakServiceApiClient],
        }).compile();

        serviceClient = module.get(KC_SERVICE_CLIENT);
    }, 10000000);

    it('should get access token', async () => {
        const accessToken: string | undefined = await serviceClient.getAccessToken();

        expect(accessToken).toBeDefined();
    });

    it('should get another access token after the first has expired', async () => {
        const firstAccessToken: string | undefined = await serviceClient.getAccessToken();

        tokenSetExpiredSpy.mockReturnValueOnce(true);

        const secondAccessToken: string | undefined = await serviceClient.getAccessToken();

        expect(firstAccessToken).toBeDefined();
        expect(secondAccessToken).toBeDefined();
        expect(firstAccessToken).not.toBe(secondAccessToken);
    });
});
