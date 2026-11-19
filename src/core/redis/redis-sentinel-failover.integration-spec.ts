import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createSentinel, type RedisSentinelType } from '@keyv/redis';
import { Logger } from '@nestjs/common';
import { RedisStore } from 'connect-redis';
import { type SessionData } from 'express-session';
import { type ExecResult, GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { RedisConfig } from '../../shared/config/redis.config.js';
import { createRedisSentinelOptions, createSentinelSessionStoreClient } from './redis-client.js';

const REDIS_HOST: string = '127.0.0.1';
const PRIMARY_PORT: number = 6379;
const REPLICA_PORT: number = 6380;
const SENTINEL_PORT: number = 26379;
const MASTER_NAME: string = 'valkeyha';

describe('Redis Sentinel session store', () => {
    let topology: StartedTestContainer;
    let client: RedisSentinelType;
    let store: RedisStore;

    beforeAll(async () => {
        const password: string = randomUUID();
        topology = await new GenericContainer('redis:7.2.2')
            .withEnvironment({ REDISCLI_AUTH: password })
            .withExposedPorts(PRIMARY_PORT, REPLICA_PORT, SENTINEL_PORT)
            .withCommand([
                'sh',
                '-ec',
                `
                redis-server --port ${PRIMARY_PORT} --requirepass "$REDISCLI_AUTH" \
                    --masterauth "$REDISCLI_AUTH" --save '' --repl-diskless-sync-delay 0 &
                redis-server --port ${REPLICA_PORT} --requirepass "$REDISCLI_AUTH" \
                    --masterauth "$REDISCLI_AUTH" --save '' --repl-diskless-sync-delay 0 \
                    --replicaof ${REDIS_HOST} ${PRIMARY_PORT} --replica-announce-ip ${REDIS_HOST} &
                printf '%s\\n' \
                    'port ${SENTINEL_PORT}' \
                    "requirepass $REDISCLI_AUTH" \
                    'sentinel monitor ${MASTER_NAME} ${REDIS_HOST} ${PRIMARY_PORT} 1' \
                    "sentinel auth-pass ${MASTER_NAME} $REDISCLI_AUTH" \
                    'sentinel failover-timeout ${MASTER_NAME} 15000' \
                    > /tmp/sentinel.conf
                exec redis-server /tmp/sentinel.conf --sentinel
                `,
            ])
            .withWaitStrategy(
                Wait.forAll([
                    Wait.forListeningPorts(),
                    Wait.forSuccessfulCommand(
                        `redis-cli --raw -e -p ${SENTINEL_PORT} SENTINEL REPLICAS ${MASTER_NAME} | grep -Fxq ${REPLICA_PORT}`,
                    ),
                ]),
            )
            .start();

        const host: string = topology.getHost();
        const config: RedisConfig = Object.assign(new RedisConfig(), {
            USERNAME: 'default',
            PASSWORD: password,
            USE_TLS: false,
            SENTINEL_ENABLED: true,
            SENTINEL_MASTER_NAME: MASTER_NAME,
            SENTINEL_NODES: [{ HOST: host, PORT: topology.getMappedPort(SENTINEL_PORT) }],
            SENTINEL_USE_TLS: false,
        });
        client = createSentinel({
            ...createRedisSentinelOptions(config),
            // Sentinel advertises container ports; Vitest connects through Docker's mapped ports.
            nodeAddressMap: {
                [`${REDIS_HOST}:${PRIMARY_PORT}`]: { host, port: topology.getMappedPort(PRIMARY_PORT) },
                [`${REDIS_HOST}:${REPLICA_PORT}`]: { host, port: topology.getMappedPort(REPLICA_PORT) },
            },
        });
        await client.on('error', (error: unknown) => Logger.error(error, 'Redis Sentinel session store')).connect();

        store = new RedisStore({ client: createSentinelSessionStoreClient(client) });
    });

    afterAll(async () => {
        try {
            if (client?.isOpen) {
                await client.destroy();
            }
        } finally {
            await topology?.stop();
        }
    });

    async function redisCommand(port: number, args: string[], expectedExitCode: number = 0): Promise<string> {
        // Sentinel disconnects clients on nodes that change roles. Each probe opens a fresh connection.
        const result: ExecResult = await topology.exec(['redis-cli', '--raw', '-e', '-p', `${port}`, ...args]);
        expect(result.exitCode, result.output).toBe(expectedExitCode);
        return result.output.trim();
    }

    describe('when Sentinel promotes a replica', () => {
        it('should write to the new primary after the old primary becomes read-only', async () => {
            const sessionId: string = randomUUID();
            const key: string = `sess:${sessionId}`;
            const originalSession: SessionData = { cookie: { originalMaxAge: null, path: '/before-failover' } };
            const updatedSession: SessionData = { cookie: { originalMaxAge: null, path: '/after-failover' } };
            await store.set(sessionId, originalSession);

            const originalValue: string = await redisCommand(PRIMARY_PORT, ['GET', key]);
            expect(originalValue).toBe(JSON.stringify(originalSession));
            await vi.waitFor(
                async () => {
                    const replicatedValue: string = await redisCommand(REPLICA_PORT, ['GET', key]);
                    expect(replicatedValue).toBe(originalValue);
                },
                { timeout: 10000, interval: 250 },
            );

            const failover: string = await redisCommand(SENTINEL_PORT, ['SENTINEL', 'FAILOVER', MASTER_NAME]);
            expect(failover).toBe('OK');
            await vi.waitFor(
                async () => {
                    const oldPrimaryRole: string = await redisCommand(PRIMARY_PORT, ['ROLE']);
                    expect(oldPrimaryRole).toMatch(/^slave\n/);
                },
                { timeout: 30_000, interval: 250 },
            );
            const address: string = await redisCommand(SENTINEL_PORT, [
                'SENTINEL',
                'GET-MASTER-ADDR-BY-NAME',
                MASTER_NAME,
            ]);
            expect(address).toBe(`${REDIS_HOST}\n${REPLICA_PORT}`);

            const readOnlyError: string = await redisCommand(PRIMARY_PORT, ['SET', 'read-only-probe', 'value'], 1);
            expect(readOnlyError).toMatch(/^READONLY/);

            await store.set(sessionId, updatedSession);

            const updatedValue: string = await redisCommand(REPLICA_PORT, ['GET', key]);
            const storedSession: unknown = await store.get(sessionId);
            expect(updatedValue).toBe(JSON.stringify(updatedSession));
            expect(storedSession).toEqual(updatedSession);
        });
    });
});
