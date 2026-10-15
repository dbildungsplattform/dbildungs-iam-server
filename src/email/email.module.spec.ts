import { vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { type RedisClientType } from 'redis';
import { DatabaseTestModule, EmailConfigTestModule, LoggingTestModule } from '../../test/utils/index.js';
import { EmailModule } from './email.module.js';

function createRedisClientMock(overrides?: Partial<RedisClientType>): RedisClientType {
    return {
        connect: vi.fn(),
        disconnect: vi.fn(),
        get: vi.fn(),
        set: vi.fn(),
        ...overrides,
    } as RedisClientType;
}

vi.mock('redis', () => ({
    createClient: (): RedisClientType => createRedisClientMock(),
}));

describe('EmailModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [EmailModule, EmailConfigTestModule, LoggingTestModule, DatabaseTestModule.forRoot()],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    it('should run its configure method', () => {
        expect(module.get(EmailModule)).toBeDefined();
    });
});
