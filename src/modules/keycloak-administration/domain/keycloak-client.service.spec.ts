import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { KeycloakAdminClient } from '@s3pweb/keycloak-admin-client-cjs';

import { ConfigTestModule, KeycloakConfigTestModule, LoggingTestModule } from '../../../../test/utils/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { type DomainError } from '../../../shared/error/domain.error.js';
import { KeycloakClientError } from '../../../shared/error/keycloak-client.error.js';
import { KC_SERVICE_CLIENT } from '../keycloak-client-providers.js';
import { KeycloakClientService } from './keycloak-client.service.js';
import { Clients } from '@keycloak/keycloak-admin-client/lib/resources/clients.js';

describe('KeycloakClientService', () => {
    let module: TestingModule;
    let sut: KeycloakClientService;

    let kcAdminClientMock: DeepMocked<KeycloakAdminClient>;
    let kcClientsMock: DeepMocked<Clients>;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, LoggingTestModule, KeycloakConfigTestModule.forRoot()],
            providers: [
                KeycloakClientService,
                {
                    provide: KC_SERVICE_CLIENT,
                    useValue: createMock<KeycloakAdminClient>(KeycloakAdminClient),
                },
            ],
        }).compile();

        sut = module.get(KeycloakClientService);

        loggerMock = module.get(ClassLogger);
        kcAdminClientMock = module.get(KC_SERVICE_CLIENT);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        kcClientsMock = createMock(Clients, {
            update: vi.fn().mockResolvedValue(undefined),
        });

        (kcAdminClientMock.clients as unknown as Clients) = kcClientsMock;
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('updateClient', () => {
        it('should call update on the keycloak client', async () => {
            const clientId: string = faker.string.uuid();

            const result: Result<undefined, DomainError> = await sut.updateClient(clientId, {});

            expect(kcClientsMock.update).toHaveBeenCalledWith({ id: clientId }, {});
            expect(result.ok).toBe(true);
        });

        it('should log errors and return them', async () => {
            const clientId: string = faker.string.uuid();
            const error: Error = new Error('Test Error');
            kcClientsMock.update.mockRejectedValueOnce(error);

            const result: Result<undefined, DomainError> = await sut.updateClient(clientId, {});

            expect(loggerMock.error).toHaveBeenCalledWith(`Could not update client with ID ${clientId}`, error);
            expect(result).toEqual({
                ok: false,
                error: new KeycloakClientError('Could not update client'),
            });
        });
    });
});
