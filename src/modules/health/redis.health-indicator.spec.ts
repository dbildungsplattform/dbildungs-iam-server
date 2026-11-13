import { ConfigService } from '@nestjs/config';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import * as redis from 'redis';
import * as keyvRedis from '@keyv/redis';
import { type Mock } from 'vitest';
import { RedisConfig, type ServerConfig } from '../../shared/config/index.js';
import { createRedisSentinelOptions, type SentinelConnectionOptions } from '../../core/redis/redis-client.js';
import { RedisHealthIndicator } from './redis.health-indicator.js';

const createClientMock: Mock<(options?: redis.RedisClientOptions) => redis.RedisClientType> = vi.hoisted(() => vi.fn());
const createSentinelMock: Mock<(options: SentinelConnectionOptions) => keyvRedis.RedisSentinelType> = vi.hoisted(() =>
    vi.fn(),
);

vi.mock('redis', async (importOriginal: () => Promise<typeof redis>) => {
    const actual: typeof redis = await importOriginal();
    return { ...actual, createClient: createClientMock };
});

vi.mock('@keyv/redis', async (importOriginal: () => Promise<typeof keyvRedis>) => {
    const actual: typeof keyvRedis = await importOriginal();
    return { ...actual, createSentinel: createSentinelMock };
});

describe('RedisHealthIndicator', () => {
    let actualRedis: typeof redis;
    let actualKeyvRedis: typeof keyvRedis;
    let config: RedisConfig;
    let client: redis.RedisClientType;
    let indicator: RedisHealthIndicator;

    beforeAll(async () => {
        actualRedis = await vi.importActual<typeof redis>('redis');
        actualKeyvRedis = await vi.importActual<typeof keyvRedis>('@keyv/redis');
    });

    beforeEach(() => {
        config = Object.assign(new RedisConfig(), {
            HOST: 'localhost',
            PORT: 6379,
            USERNAME: 'default',
            PASSWORD: 'test-password',
            USE_TLS: false,
        });
        client = actualRedis.createClient();
        vi.spyOn(client, 'connect').mockImplementation(() => {
            client.emit('ready');
            return Promise.resolve(client);
        });
        vi.spyOn(client, 'disconnect').mockResolvedValue(undefined);
        createClientMock.mockReturnValue(client);
        indicator = new RedisHealthIndicator(
            new ConfigService<ServerConfig>({ REDIS: config }),
            new HealthIndicatorService(),
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetAllMocks();
    });

    function mockSentinel(): keyvRedis.RedisSentinelType {
        Object.assign(config, {
            SENTINEL_ENABLED: true,
            SENTINEL_MASTER_NAME: 'test-master',
            SENTINEL_NODES: [{ HOST: 'sentinel.example', PORT: 26379 }],
        });
        const sentinel: keyvRedis.RedisSentinelType = actualKeyvRedis.createSentinel(
            createRedisSentinelOptions(config),
        );
        vi.spyOn(sentinel, 'connect').mockResolvedValue(sentinel);
        vi.spyOn(sentinel, 'close').mockResolvedValue(undefined);
        createSentinelMock.mockReturnValue(sentinel);
        return sentinel;
    }

    describe('check', () => {
        it.each([false, true])('should preserve the standalone health check with TLS %s', async (useTls: boolean) => {
            Object.assign(config, { USE_TLS: useTls });

            const result: HealthIndicatorResult = await indicator.check();

            expect(result).toEqual({ Redis: { status: 'up', message: '' } });
            expect(redis.createClient).toHaveBeenCalledWith({
                username: 'default',
                password: 'test-password',
                socket: {
                    host: 'localhost',
                    port: 6379,
                    tls: useTls || undefined,
                    key: undefined,
                    cert: undefined,
                    connectTimeout: 1000,
                    reconnectStrategy: false,
                },
            });
            expect(client.disconnect).toHaveBeenCalledOnce();
            expect(keyvRedis.createSentinel).not.toHaveBeenCalled();
        });

        it('should report connection error events as down', async () => {
            vi.mocked(client.connect).mockImplementationOnce(() => {
                client.emit('error', new Error('Connection failed'));
                return Promise.resolve(client);
            });

            const result: HealthIndicatorResult = await indicator.check();

            expect(result).toEqual({
                Redis: { status: 'down', message: 'Redis does not seem to be up: Connection failed' },
            });
        });

        it('should report connection exceptions as down', async () => {
            vi.mocked(client.connect).mockRejectedValueOnce(new Error('Connection failed'));

            const result: HealthIndicatorResult = await indicator.check();

            expect(result).toEqual({
                Redis: { status: 'down', message: 'Exception while making connection: Error: Connection failed' },
            });
        });

        it('should check Sentinel without requiring a ready event and close its connection', async () => {
            const sentinel: keyvRedis.RedisSentinelType = mockSentinel();

            const result: HealthIndicatorResult = await indicator.check();

            expect(result).toEqual({ Redis: { status: 'up', message: '' } });
            expect(sentinel.close).toHaveBeenCalledOnce();
            expect(redis.createClient).not.toHaveBeenCalled();
            expect(createSentinelMock.mock.calls[0]?.[0]).toMatchObject({
                maxCommandRediscovers: 0,
                nodeClientOptions: {
                    socket: { connectTimeout: 1000, reconnectStrategy: false },
                },
                sentinelClientOptions: {
                    socket: { connectTimeout: 1000, reconnectStrategy: false },
                },
            });
        });

        it('should close failed Sentinel connections and report down', async () => {
            const sentinel: keyvRedis.RedisSentinelType = mockSentinel();
            vi.mocked(sentinel.connect).mockRejectedValueOnce(new Error('Sentinel unavailable'));

            const result: HealthIndicatorResult = await indicator.check();

            expect(result).toEqual({
                Redis: { status: 'down', message: 'Exception while making connection: Error: Sentinel unavailable' },
            });
            expect(sentinel.close).toHaveBeenCalledOnce();
        });

        it('should report Sentinel cleanup failures as down', async () => {
            const sentinel: keyvRedis.RedisSentinelType = mockSentinel();
            vi.mocked(sentinel.close).mockRejectedValueOnce(new Error('Close failed'));

            const result: HealthIndicatorResult = await indicator.check();

            expect(result).toEqual({
                Redis: { status: 'down', message: 'Exception while making connection: Error: Close failed' },
            });
        });
    });
});
