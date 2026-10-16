import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { KeycloakAdminClient } from '@s3pweb/keycloak-admin-client-cjs';

import { ConfigTestModule, KeycloakConfigTestModule, LoggingTestModule } from '../../../../test/utils/index.js';
import { KeycloakClientError } from '../../../shared/error/index.js';
import { KeycloakAdministrationService } from './keycloak-admin-client.service.js';

describe('KeycloakAdminClientService', () => {
    let module: TestingModule;
    let service: KeycloakAdministrationService;
    let kcAdminClient: DeepMocked<KeycloakAdminClient>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, LoggingTestModule, KeycloakConfigTestModule.forRoot()],
            providers: [
                KeycloakAdministrationService,
                {
                    provide: KeycloakAdminClient,
                    useValue: createMock(KeycloakAdminClient),
                },
            ],
        }).compile();

        service = module.get(KeycloakAdministrationService);
        kcAdminClient = module.get(KeycloakAdminClient);
    });

    afterAll(async () => {
        await module.close();
    });

    afterEach(() => {
        service.resetLastAuthorizationTime();
        vi.resetAllMocks();
    });

    describe('getAuthedKcAdminClient', () => {
        describe('when auth is successful', () => {
            it('should return the original client', async () => {
                const ret: Result<KeycloakAdminClient, Error> = await service.getAuthedKcAdminClient();

                expect(ret).toStrictEqual<Result<KeycloakAdminClient>>({
                    ok: true,
                    value: kcAdminClient,
                });
            });

            it('should authorize before client access', async () => {
                await service.getAuthedKcAdminClient();

                expect(kcAdminClient.auth).toHaveBeenCalled();
            });

            it('should authorize only once per minute', async () => {
                vi.useFakeTimers();

                // set timer
                vi.setSystemTime(new Date(2020, 1, 1, 0, 0, 0));
                await service.getAuthedKcAdminClient();
                kcAdminClient.auth.mockClear();

                await service.getAuthedKcAdminClient();
                expect(kcAdminClient.auth).not.toHaveBeenCalled();

                vi.setSystemTime(new Date(2020, 1, 1, 0, 1, 0));
                await service.getAuthedKcAdminClient();
                expect(kcAdminClient.auth).toHaveBeenCalled();

                vi.useRealTimers();
            });
        });

        describe('when auth is not successfull', () => {
            it('should return error result', async () => {
                kcAdminClient.auth.mockRejectedValueOnce(new Error());

                const ret: Result<KeycloakAdminClient, Error> = await service.getAuthedKcAdminClient();

                expect(ret).toStrictEqual<Result<KeycloakAdminClient>>({
                    ok: false,
                    error: new KeycloakClientError('Could not authorize with Keycloak'),
                });
            });
        });
    });
});
