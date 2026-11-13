import { type RedisClientOptions, type RedisSentinelType } from '@keyv/redis';
import { type RedisSentinelOptions } from 'redis';
import { type RedisConfig } from '../../shared/config/redis.config.js';
import { type RedisSentinelNodeConfig } from '../../shared/config/redis-sentinel-node.config.js';
import { SharedDomainError } from '../../shared/error/shared-domain.error.js';

type NoExtensions = Record<never, never>;
export type SentinelConnectionOptions = RedisSentinelOptions<NoExtensions, NoExtensions, NoExtensions, 2, NoExtensions>;
type SentinelSessionStoreClient = Pick<RedisSentinelType, 'get' | 'set' | 'expire' | 'del' | 'mGet'> & {
    scanIterator(options?: Parameters<RedisSentinelType['scan']>[1]): AsyncGenerator<string[]>;
};

export function createRedisSentinelOptions(
    config: RedisConfig,
    socketOptions: Pick<NonNullable<RedisClientOptions['socket']>, 'connectTimeout' | 'reconnectStrategy'> = {},
): SentinelConnectionOptions {
    const name: string | undefined = config.SENTINEL_MASTER_NAME;
    const nodes: RedisSentinelNodeConfig[] | undefined = config.SENTINEL_NODES;
    if (!name || !nodes?.length) {
        throw new SharedDomainError('Sentinel requires a master name and endpoints', 'REDIS_CONFIGURATION_ERROR');
    }

    const tlsOptions: RedisClientOptions['socket'] = {
        tls: true,
        key: config.PRIVATE_KEY,
        cert: config.CERT_CHAINS,
        ca: config.CERTIFICATE_AUTHORITIES,
    };

    return {
        name,
        sentinelRootNodes: nodes.map((node: RedisSentinelNodeConfig) => ({
            host: node.HOST,
            port: node.PORT,
        })),
        nodeClientOptions: {
            username: config.USERNAME,
            password: config.PASSWORD,
            socket: config.USE_TLS ? { ...socketOptions, ...tlsOptions } : socketOptions,
        },
        sentinelClientOptions: {
            username: config.SENTINEL_USERNAME ?? config.USERNAME,
            password: config.SENTINEL_PASSWORD ?? config.PASSWORD,
            socket: (config.SENTINEL_USE_TLS ?? config.USE_TLS) ? { ...socketOptions, ...tlsOptions } : socketOptions,
        },
        replicaPoolSize: 0,
        passthroughClientErrorEvents: true,
    };
}

export function createSentinelSessionStoreClient(client: RedisSentinelType): SentinelSessionStoreClient {
    return {
        get: client.get.bind(client),
        set: client.set.bind(client),
        expire: client.expire.bind(client),
        del: client.del.bind(client),
        mGet: client.mGet.bind(client),
        async *scanIterator(options?: Parameters<RedisSentinelType['scan']>[1]): AsyncGenerator<string[]> {
            let cursor: string = '0';
            do {
                // SCAN pages depend on the cursor returned by the previous page.
                // eslint-disable-next-line no-await-in-loop
                const result: Awaited<ReturnType<RedisSentinelType['scan']>> = await client.scan(cursor, options);
                cursor = result.cursor;
                yield result.keys;
            } while (cursor !== '0');
        },
    };
}
