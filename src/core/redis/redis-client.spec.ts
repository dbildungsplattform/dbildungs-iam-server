import 'reflect-metadata';
import KeyvRedis, { createSentinel, type RedisSentinelType } from '@keyv/redis';
import { RedisConfig } from '../../shared/config/redis.config.js';
import {
    createRedisSentinelOptions,
    createSentinelSessionStoreClient,
    type SentinelConnectionOptions,
} from './redis-client.js';

type SessionStoreClient = ReturnType<typeof createSentinelSessionStoreClient>;

function config(overrides: Partial<RedisConfig> = {}): RedisConfig {
    return Object.assign(new RedisConfig(), {
        HOST: 'static-master.example',
        PORT: 6379,
        USERNAME: 'valkey-user',
        PASSWORD: 'valkey-test-password',
        USE_TLS: false,
        SENTINEL_ENABLED: true,
        SENTINEL_MASTER_NAME: 'test-master',
        SENTINEL_NODES: [{ HOST: 'sentinel.example', PORT: 26379 }],
        ...overrides,
    });
}

describe('Redis Sentinel', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('createRedisSentinelOptions', () => {
        it('should discover the master and reuse Redis credentials without using the static host', () => {
            const options: SentinelConnectionOptions = createRedisSentinelOptions(config());

            expect(options).toEqual({
                name: 'test-master',
                sentinelRootNodes: [{ host: 'sentinel.example', port: 26379 }],
                nodeClientOptions: { username: 'valkey-user', password: 'valkey-test-password', socket: {} },
                sentinelClientOptions: { username: 'valkey-user', password: 'valkey-test-password', socket: {} },
                replicaPoolSize: 0,
                passthroughClientErrorEvents: true,
            });
        });

        it('should reuse Redis TLS settings and certificates', () => {
            const options: SentinelConnectionOptions = createRedisSentinelOptions(
                config({
                    USE_TLS: true,
                    PRIVATE_KEY: 'node-key',
                    CERT_CHAINS: 'node-certificate',
                    CERTIFICATE_AUTHORITIES: 'node-ca',
                }),
            );

            expect(options.nodeClientOptions?.socket).toEqual({
                tls: true,
                key: 'node-key',
                cert: 'node-certificate',
                ca: 'node-ca',
            });
            expect(options.sentinelClientOptions?.socket).toEqual(options.nodeClientOptions?.socket);
        });

        it('should allow separate Sentinel credentials and TLS', () => {
            const options: SentinelConnectionOptions = createRedisSentinelOptions(
                config({
                    SENTINEL_USERNAME: 'sentinel-user',
                    SENTINEL_PASSWORD: 'sentinel-test-password',
                    SENTINEL_USE_TLS: true,
                }),
            );

            expect(options.sentinelClientOptions).toMatchObject({
                username: 'sentinel-user',
                password: 'sentinel-test-password',
                socket: { tls: true },
            });
            expect(options.nodeClientOptions?.socket).toEqual({});
        });

        it('should allow explicitly disabling Sentinel authentication and TLS', () => {
            const options: SentinelConnectionOptions = createRedisSentinelOptions(
                config({
                    USE_TLS: true,
                    SENTINEL_USERNAME: '',
                    SENTINEL_PASSWORD: '',
                    SENTINEL_USE_TLS: false,
                }),
            );

            expect(options.sentinelClientOptions).toEqual({ username: '', password: '', socket: {} });
            expect(options.nodeClientOptions?.socket).toMatchObject({ tls: true });
        });

        it.each([false, true])('should apply health-check socket settings with TLS %s', (useTls: boolean) => {
            const options: SentinelConnectionOptions = createRedisSentinelOptions(config({ USE_TLS: useTls }), {
                connectTimeout: 1000,
                reconnectStrategy: false,
            });

            expect(options.nodeClientOptions?.socket).toMatchObject({
                connectTimeout: 1000,
                reconnectStrategy: false,
            });
            expect(options.sentinelClientOptions?.socket).toEqual(options.nodeClientOptions?.socket);
        });

        it.each([
            { SENTINEL_MASTER_NAME: undefined },
            { SENTINEL_MASTER_NAME: '' },
            { SENTINEL_NODES: undefined },
            { SENTINEL_NODES: [] },
        ])('should reject incomplete Sentinel configuration %j', (overrides: Partial<RedisConfig>) => {
            const createOptions: () => SentinelConnectionOptions = () => createRedisSentinelOptions(config(overrides));

            expect(createOptions).toThrow('Sentinel requires a master name and endpoints');
        });

        it('should support the existing cache adapter', () => {
            const store: KeyvRedis<unknown> = new KeyvRedis(createRedisSentinelOptions(config()));

            expect(store.client).toHaveProperty('getSentinelNode');
        });
    });

    describe('createSentinelSessionStoreClient', () => {
        let client: RedisSentinelType;

        beforeEach(() => {
            client = createSentinel(createRedisSentinelOptions(config()));
        });

        it('should forward session reads with the correct client binding', async () => {
            vi.spyOn(client, 'get').mockResolvedValueOnce('session');
            const adapter: SessionStoreClient = createSentinelSessionStoreClient(client);

            const result: string | null = await adapter.get('sess:one');

            expect(result).toBe('session');
            expect(client.get).toHaveBeenCalledWith('sess:one');
            expect(vi.mocked(client.get).mock.contexts[0]).toBe(client);
        });

        it('should preserve session expiration options', async () => {
            vi.spyOn(client, 'set').mockResolvedValueOnce('OK');
            const adapter: SessionStoreClient = createSentinelSessionStoreClient(client);
            const options: Parameters<RedisSentinelType['set']>[2] = { expiration: { type: 'EX', value: 60 } };

            await adapter.set('sess:one', 'session', options);

            expect(client.set).toHaveBeenCalledWith('sess:one', 'session', options);
        });

        it('should forward session touches', async () => {
            vi.spyOn(client, 'expire').mockResolvedValueOnce(1);
            const adapter: SessionStoreClient = createSentinelSessionStoreClient(client);

            await adapter.expire('sess:one', 60);

            expect(client.expire).toHaveBeenCalledWith('sess:one', 60);
        });

        it('should forward session deletion', async () => {
            vi.spyOn(client, 'del').mockResolvedValueOnce(1);
            const adapter: SessionStoreClient = createSentinelSessionStoreClient(client);

            await adapter.del(['sess:one']);

            expect(client.del).toHaveBeenCalledWith(['sess:one']);
        });

        it('should forward reads of multiple sessions', async () => {
            vi.spyOn(client, 'mGet').mockResolvedValueOnce(['one', null]);
            const adapter: SessionStoreClient = createSentinelSessionStoreClient(client);

            const result: (string | null)[] = await adapter.mGet(['sess:one', 'sess:two']);

            expect(result).toEqual(['one', null]);
            expect(client.mGet).toHaveBeenCalledWith(['sess:one', 'sess:two']);
        });

        it('should scan every cursor page including empty pages', async () => {
            vi.spyOn(client, 'scan')
                .mockResolvedValueOnce({ cursor: '17', keys: [] })
                .mockResolvedValueOnce({ cursor: '42', keys: ['sess:one'] })
                .mockResolvedValueOnce({ cursor: '0', keys: ['sess:two'] });
            const adapter: SessionStoreClient = createSentinelSessionStoreClient(client);
            const batches: string[][] = [];
            const options: Parameters<RedisSentinelType['scan']>[1] = { MATCH: 'sess:*', COUNT: 2 };

            for await (const keys of adapter.scanIterator(options)) {
                batches.push(keys);
            }

            expect(batches).toEqual([[], ['sess:one'], ['sess:two']]);
            expect(client.scan).toHaveBeenNthCalledWith(1, '0', options);
            expect(client.scan).toHaveBeenNthCalledWith(2, '17', options);
            expect(client.scan).toHaveBeenNthCalledWith(3, '42', options);
        });

        it('should scan without options', async () => {
            vi.spyOn(client, 'scan').mockResolvedValueOnce({ cursor: '0', keys: [] });
            const iterator: AsyncGenerator<string[]> = createSentinelSessionStoreClient(client).scanIterator();

            await iterator.next();

            expect(client.scan).toHaveBeenCalledWith('0', undefined);
        });

        it('should propagate scan failures', async () => {
            const error: Error = new Error('scan failed');
            vi.spyOn(client, 'scan').mockRejectedValueOnce(error);
            const iterator: AsyncGenerator<string[]> = createSentinelSessionStoreClient(client).scanIterator();

            await expect(iterator.next()).rejects.toThrow(error);
        });
    });
});
