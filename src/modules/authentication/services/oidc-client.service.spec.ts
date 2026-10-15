import { Test, type TestingModule } from '@nestjs/testing';
import type * as OpenIdClient from 'openid-client';
import { type Client, type Issuer } from 'openid-client';

import { ConfigTestModule, KeycloakConfigTestModule } from '../../../../test/utils/index.js';
import { OIDCClientProvider, OIDC_CLIENT } from './oidc-client.service.js';

// vi.mock('openid-client', () => ({
//     Issuer: {
//         discover: vi.fn(() => Promise.resolve({ Client: Object })),
//     },
// }));

type importType = typeof OpenIdClient;
vi.mock<importType>(import('openid-client'), async (importOriginal: () => Promise<importType>) => {
    const originalModule: importType = await importOriginal();
    const mockedModule: importType = {
        ...originalModule,
        Issuer: {
            discover: vi.fn(() => Promise.resolve({ Client: Object })),
        } as unknown as typeof Issuer,
    };
    return mockedModule;
});

describe('OIDCClientProvider', () => {
    let module: TestingModule;
    let sut: Client;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [KeycloakConfigTestModule.forRoot(), ConfigTestModule],
            providers: [OIDCClientProvider],
        }).compile();

        sut = module.get(OIDC_CLIENT);
    });

    afterAll(async () => {
        await module.close();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });
});
