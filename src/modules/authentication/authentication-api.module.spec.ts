import { Test, type TestingModule } from '@nestjs/testing';
import { Issuer } from 'openid-client';

import { DatabaseTestModule } from '../../../test/utils/index.js';
import { AuthenticationController } from './api/authentication.controller.js';
import { OIDC_CLIENT } from './services/oidc-client.service.js';
import { AuthenticationApiModule } from './authentication-api.module.js';
import { PersonModule } from '../person/person.module.js';
import { PersonenKontextModule } from '../personenkontext/personenkontext.module.js';
import { CACHE_MANAGER, CacheModule } from '@nestjs/cache-manager';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';

describe('AuthenticationApiModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                CommonTestModule,
                AuthenticationApiModule,
                DatabaseTestModule.forRoot(),
                PersonModule,
                PersonenKontextModule,
                CacheModule.register({ isGlobal: true }),
            ],
            providers: [{ provide: CACHE_MANAGER, useValue: { get: vi.fn(), set: vi.fn() } }],
        })
            .overrideProvider(OIDC_CLIENT)
            .useValue(
                new new Issuer({
                    issuer: 'oidc',
                    jwks_uri: 'https://keycloak.example.com/nothing',
                }).Client({ client_id: 'DummyId' }),
            )
            .compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve AuthenticationController', () => {
            expect(module.get(AuthenticationController)).toBeInstanceOf(AuthenticationController);
        });
    });
});
