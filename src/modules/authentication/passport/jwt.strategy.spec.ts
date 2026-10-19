import { faker } from '@faker-js/faker';
import type * as JsonWebToken from 'jsonwebtoken';
import { decode } from 'jsonwebtoken';
import { type BaseClient, type Issuer } from 'openid-client';
import { type Mock } from 'vitest';
import { createOidcClientMock } from '../../../../test/utils/auth.mock.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { createRequestMock } from '../../../../test/utils/http.mocks.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { KeycloakUserNotFoundError } from '../domain/keycloak-user-not-found.error.js';
import { JwtStrategy } from './jwt.strategy.js';

type importType = typeof JsonWebToken;
vi.mock<importType>(import('jsonwebtoken'), async (importOriginal: () => Promise<importType>) => {
    const originalModule: importType = await importOriginal();
    return {
        ...originalModule,
        decode: vi.fn().mockReturnValue(null),
    };
});

describe('JWT Strategy', () => {
    it('should extract a bearer token from the header and return it for session storage', async () => {
        const client: DeepMocked<BaseClient> = createOidcClientMock({
            issuer: {
                metadata: { jwks_uri: 'https://nowhere.example.com', issuer: 'https://anyhere.example.com' },
            } as Issuer,
        });
        const personRepositoryMock: DeepMocked<PersonRepository> = createMock(PersonRepository);
        const sut: JwtStrategy = new JwtStrategy(client, personRepositoryMock);
        const request: Request = createRequestMock({
            headers: { authorization: 'Bearer 12345' },
        }) as unknown as Request;
        const sessionContent: { access_token: string } = await sut.validate(request, '');

        expect(sessionContent.access_token).toEqual('12345');
    });

    it('should return empty string if no accessToken can be extracted', async () => {
        const client: DeepMocked<BaseClient> = createOidcClientMock({
            issuer: {
                metadata: { jwks_uri: 'https://nowhere.example.com', issuer: 'https://anyhere.example.com' },
            } as Issuer,
        });
        const personRepositoryMock: DeepMocked<PersonRepository> = createMock(PersonRepository);
        const sut: JwtStrategy = new JwtStrategy(client, personRepositoryMock);
        const request: Request = createRequestMock({
            headers: { authorization: '' },
        }) as unknown as Request;
        const sessionContent: { access_token: string } = await sut.validate(request, '');

        expect(sessionContent.access_token).toEqual('');
    });

    it('should check if user exists by keycloak id', async () => {
        const client: DeepMocked<BaseClient> = createOidcClientMock({
            issuer: {
                metadata: { jwks_uri: 'https://nowhere.example.com', issuer: 'https://anyhere.example.com' },
            } as Issuer,
        });
        const personRepositoryMock: DeepMocked<PersonRepository> = createMock(PersonRepository);
        personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(DoFactory.createPerson(true));
        const sut: JwtStrategy = new JwtStrategy(client, personRepositoryMock);

        (decode as Mock).mockReturnValue({
            sub: faker.string.uuid().toString(),
        });
        const request: Request = createRequestMock({
            headers: { authorization: 'Bearer 12345' },
        }) as unknown as Request;

        const sessionContent: { access_token: string } = await sut.validate(request, '');

        expect(sessionContent.access_token).toEqual('12345');
        expect(personRepositoryMock.findByKeycloakUserId).toHaveBeenCalled();
    });

    it('should throw KeycloakUserNotFoundError if the kc user does not exist', async () => {
        const client: DeepMocked<BaseClient> = createOidcClientMock({
            issuer: {
                metadata: { jwks_uri: 'https://nowhere.example.com', issuer: 'https://anyhere.example.com' },
            } as Issuer,
        });
        const personRepositoryMock: DeepMocked<PersonRepository> = createMock(PersonRepository);
        personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(undefined);
        const sut: JwtStrategy = new JwtStrategy(client, personRepositoryMock);

        (decode as Mock).mockReturnValue({
            sub: faker.string.uuid().toString(),
        });
        const request: Request = createRequestMock({
            headers: { authorization: 'Bearer 12345' },
        }) as unknown as Request;

        await expect(sut.validate(request, '')).rejects.toThrow(KeycloakUserNotFoundError);
    });
});
