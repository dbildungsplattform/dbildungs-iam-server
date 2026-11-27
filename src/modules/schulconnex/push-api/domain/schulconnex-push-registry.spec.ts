import { SchulconnexPushRegistry } from './schulconnex-push-registry.js';

describe('SchulconnexPushRegistry', () => {
    describe('construct', () => {
        it('should create a persisted registry with all given values', () => {
            const createdAt: Date = new Date('2024-01-01T00:00:00.000Z');
            const updatedAt: Date = new Date('2024-01-02T00:00:00.000Z');

            const result: SchulconnexPushRegistry<true> = SchulconnexPushRegistry.construct(
                'registry-1',
                createdAt,
                updatedAt,
                'service-provider-1',
                'http://localhost',
                'https://identity.example/token',
                'push-client',
                'EXAMPLE_PROVIDER',
            );

            expect(result).toBeInstanceOf(SchulconnexPushRegistry);
            expect(result.id).toBe('registry-1');
            expect(result.createdAt).toBe(createdAt);
            expect(result.updatedAt).toBe(updatedAt);
            expect(result.serviceProviderId).toBe('service-provider-1');
            expect(result.baseUrl).toBe('http://localhost');
            expect(result.oidcTokenEndpoint).toBe('https://identity.example/token');
            expect(result.oidcClientId).toBe('push-client');
            expect(result.oidcClientSecretRef).toBe('EXAMPLE_PROVIDER');
        });
    });

    describe('createNew', () => {
        it('should create a non-persisted registry without id and timestamps', () => {
            const result: SchulconnexPushRegistry<false> = SchulconnexPushRegistry.createNew(
                'service-provider-1',
                'http://localhost',
                'https://identity.example/token',
                'push-client',
                'EXAMPLE_PROVIDER',
            );

            expect(result).toBeInstanceOf(SchulconnexPushRegistry);
            expect(result.id).toBeUndefined();
            expect(result.createdAt).toBeUndefined();
            expect(result.updatedAt).toBeUndefined();
            expect(result.serviceProviderId).toBe('service-provider-1');
            expect(result.baseUrl).toBe('http://localhost');
            expect(result.oidcTokenEndpoint).toBe('https://identity.example/token');
            expect(result.oidcClientId).toBe('push-client');
            expect(result.oidcClientSecretRef).toBe('EXAMPLE_PROVIDER');
        });
    });
});
