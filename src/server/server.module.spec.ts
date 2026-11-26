import { type MiddlewareConsumer } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { type RedisClientType } from 'redis';
import { ConfigTestModule, DatabaseTestModule, LoggingTestModule } from '../../test/utils/index.js';
import { EmailWebhookController } from '../modules/email-microservice/api/email-microservice-webhook.controller.js';
import { EmailMicroserviceEventHandler } from '../modules/email-microservice/domain/email-microservice-event-handler.js';
import { ServerModule } from './server.module.js';

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
}));

describe('ServerModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ServerModule, ConfigTestModule, LoggingTestModule, DatabaseTestModule.forRoot()],
        }).compile();
    });

    afterAll(async () => {
        if (module) {
            await module.close();
        }
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
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

    it('should register the email microservice webhook controller and event handler', () => {
        expect(module.get(EmailWebhookController)).toBeInstanceOf(EmailWebhookController);
        expect(module.get(EmailMicroserviceEventHandler)).toBeInstanceOf(EmailMicroserviceEventHandler);
    });
});
