import { Test, type TestingModule } from '@nestjs/testing';

import { createMock, type DeepMocked } from '../../../test/utils/createMock.js';
import { ConfigTestModule, LoggingTestModule } from '../../../test/utils/index.js';
import { KeycloakClientService } from '../../modules/keycloak-administration/domain/keycloak-client.service.js';
import { KeycloakUpdateClientsCommand } from './keycloak-update-clients.command.js';
import { KeycloakClientError } from '../../shared/error/keycloak-client.error.js';

describe('KeycloakUpdateClientsCommand', () => {
    let module: TestingModule;
    let keycloakUpdateClients: KeycloakUpdateClientsCommand;

    let clientServiceMock: DeepMocked<KeycloakClientService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, LoggingTestModule],
            providers: [
                KeycloakUpdateClientsCommand,
                {
                    provide: KeycloakClientService,
                    useValue: createMock(KeycloakClientService),
                },
            ],
        }).compile();

        keycloakUpdateClients = module.get(KeycloakUpdateClientsCommand);

        clientServiceMock = module.get(KeycloakClientService);
        clientServiceMock.updateClient.mockResolvedValue({ ok: true, value: undefined });
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(keycloakUpdateClients).toBeDefined();
    });

    describe('run', () => {
        it('should update keycloak clients', async () => {
            await expect(keycloakUpdateClients.run(['tests'])).resolves.not.toThrow();

            expect(clientServiceMock.updateClient).toHaveBeenCalledWith('f45add8b-ab22-4742-afb4-cefa9bc12331', {
                clientId: 'spsh',
                description: 'Integration test',
            });
        });

        it('should throw error if update fails', async () => {
            const error: KeycloakClientError = new KeycloakClientError('Test Error');
            clientServiceMock.updateClient.mockResolvedValueOnce({ ok: false, error: error });

            await expect(keycloakUpdateClients.run(['tests'])).rejects.toThrow(error);
        });
    });
});
