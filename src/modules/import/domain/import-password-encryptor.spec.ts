import { Test, type TestingModule } from '@nestjs/testing';

import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { ImportPasswordEncryptor } from './import-password-encryptor.js';
import { ConfigService } from '@nestjs/config';
import { type ServerConfig } from '../../../shared/config/server.config.js';
import { faker } from '@faker-js/faker';
import { type DomainError } from '../../../shared/error/domain.error.js';
import { ImportDomainError } from './import-domain.error.js';

describe('ImportPasswordEncryptor', () => {
    let module: TestingModule;
    let sut: ImportPasswordEncryptor;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule],
            providers: [],
        }).compile();
        sut = new ImportPasswordEncryptor(module.get(ConfigService<ServerConfig>));
    });

    afterAll(async () => {
        await module.close();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('encryptPassword', () => {
        describe('when encrypt password', () => {
            it('should return encrypted data containing iv and encrypted password', async () => {
                const password: string = 'password';

                const result: string = await sut.encryptPassword(password);

                const [encryptedPassword, iv]: string[] = result.split('|');
                expect(encryptedPassword).toBeDefined();
                expect(iv).toBeDefined();
                expect(encryptedPassword).not.toEqual(password);
            });
        });
    });

    describe('decryptPassword', () => {
        describe('when decrypt encrypted password data does not contain iv', () => {
            it('should throw ImportDomainError', async () => {
                const invalidEncryptedPasswordData: string = '5ba56bceb34c5b84';
                const importvorgangId: string = faker.string.uuid();
                const error: DomainError = new ImportDomainError('iv for decryption not found', importvorgangId);

                await expect(sut.decryptPassword(invalidEncryptedPasswordData, importvorgangId)).rejects.toThrowError(
                    error,
                );
            });
        });

        describe('when decrypt encrypted password data does not contain encrypted password', () => {
            it('should throw ImportDomainError', async () => {
                const invalidEncryptedPasswordData: string = '|6ad72f7a8fa8d98daa7e3f0dc6aa2a82';
                const importvorgangId: string = faker.string.uuid();
                const error: DomainError = new ImportDomainError(
                    'encryptedPassword for decryption not found',
                    importvorgangId,
                );

                await expect(sut.decryptPassword(invalidEncryptedPasswordData, importvorgangId)).rejects.toThrowError(
                    error,
                );
            });
        });

        describe('when decrypt encrypted password data', () => {
            it('should return user password', async () => {
                const password: string = 'password';
                const encryptedPasswordData: string = await sut.encryptPassword(password);

                const result: string = await sut.decryptPassword(encryptedPasswordData, faker.string.uuid());

                expect(result).toEqual(password);
            });
        });
    });
});
