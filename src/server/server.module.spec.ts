import { type MiddlewareConsumer } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { type RedisClientType } from 'redis';
import type * as keyvRedis from '@keyv/redis';
import { ConfigService } from '@nestjs/config';
import { type Mock } from 'vitest';
import { ConfigTestModule, DatabaseTestModule, LoggingTestModule } from '../../test/utils/index.js';
import { createMock } from '../../test/utils/createMock.js';
import { ClassLogger } from '../core/logging/class-logger.js';
import { createRedisSentinelOptions, type SentinelConnectionOptions } from '../core/redis/redis-client.js';
import { RedisConfig } from '../shared/config/redis.config.js';
import { ServerModule } from './server.module.js';

const createSentinelMock: Mock<(options: SentinelConnectionOptions) => keyvRedis.RedisSentinelType> = vi.hoisted(() =>
    vi.fn(),
);

function createRedisClientMock(overrides?: Partial<RedisClientType>): RedisClientType {
    return {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        get: vi.fn(),
        set: vi.fn(),
        on: vi.fn().mockReturnThis(),
        ...overrides,
    } as RedisClientType;
}

vi.mock('redis', () => ({
    createClient: (): RedisClientType => createRedisClientMock(),
    createCluster: (): RedisClientType => createRedisClientMock(),
}));

vi.mock('@keyv/redis', async (importOriginal: () => Promise<typeof keyvRedis>) => {
    const actual: typeof keyvRedis = await importOriginal();
    return { ...actual, createSentinel: createSentinelMock };
});

describe('ServerModule', () => {
    let module: TestingModule;
    const logger: ClassLogger = createMock(ClassLogger);

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ServerModule, ConfigTestModule, LoggingTestModule, DatabaseTestModule.forRoot()],
        })
            .overrideProvider(ClassLogger)
            .useValue(logger)
            .compile();
    });

    afterAll(async () => {
        if (module) {
            await module.close();
        }
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    it('should log the application cache mode through the server module logger', () => {
        expect(logger.debug).toHaveBeenCalledWith(
            expect.stringMatching(/^Redis application cache configured: mode=standalone, host=/),
        );
    });

    it('should run its configure method', async () => {
        expect(module.get(ServerModule)).toBeDefined();
        const consumer: MiddlewareConsumer = vi.mockObject({
            apply: vi.fn().mockReturnValue({
                forRoutes: vi.fn(),
            }),
        });
        await module.get(ServerModule).configure(consumer);

        expect(consumer.apply).toHaveBeenCalled();
    });

    describe('Redis session logging', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it.each([
            { sentinel: true, clustered: true, mode: 'sentinel' },
            { sentinel: false, clustered: true, mode: 'cluster' },
            { sentinel: false, clustered: false, mode: 'standalone' },
        ])(
            'should identify $mode while connecting and after connection succeeds',
            async ({ sentinel, clustered, mode }: { sentinel: boolean; clustered: boolean; mode: string }) => {
                const redisConfig: RedisConfig = Object.assign(new RedisConfig(), {
                    HOST: 'redis.example',
                    PORT: 6379,
                    USE_TLS: false,
                    SENTINEL_ENABLED: sentinel,
                    CLUSTERED: clustered,
                    SENTINEL_MASTER_NAME: 'test-master',
                    SENTINEL_NODES: [{ HOST: 'sentinel.example', PORT: 26379 }],
                    SENTINEL_USE_TLS: false,
                });
                if (sentinel) {
                    const actual: typeof keyvRedis = await vi.importActual('@keyv/redis');
                    const client: keyvRedis.RedisSentinelType = actual.createSentinel(
                        createRedisSentinelOptions(redisConfig),
                    );
                    vi.spyOn(client, 'connect').mockResolvedValueOnce(client);
                    createSentinelMock.mockReturnValueOnce(client);
                }
                const sessionLogger: ClassLogger = createMock(ClassLogger);
                const server: ServerModule = new ServerModule(
                    new ConfigService({
                        REDIS: redisConfig,
                        FRONTEND: { SESSION_SECRET: 'test-secret' },
                    }),
                    sessionLogger,
                );
                const consumer: MiddlewareConsumer = vi.mockObject({
                    apply: vi.fn().mockReturnValue({ forRoutes: vi.fn() }),
                });

                await server.configure(consumer);

                expect(sessionLogger.debug).toHaveBeenNthCalledWith(
                    1,
                    expect.stringContaining(`Redis session store connecting: mode=${mode},`),
                );
                expect(sessionLogger.debug).toHaveBeenNthCalledWith(
                    2,
                    expect.stringContaining(`Redis session store connected: mode=${mode},`),
                );
                expect(consumer.apply).toHaveBeenCalledOnce();
            },
        );
    });
});
