/* eslint-disable max-classes-per-file */
import { type Mock, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';

import { LoggingTestModule } from '../../../../test/utils/index.js';
import { BaseEvent } from '../../../shared/events/index.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { type EventHandlerType } from '../types/util.types.js';
import { EventService } from './event.service.js';
import { type DeepMocked } from '../../../../test/utils/createMock.js';

class TestEvent extends BaseEvent {
    public constructor() {
        super();
    }
}

class UnregisteredTestEvent extends BaseEvent {
    public constructor() {
        super();
    }
}

function flushPromises(): Promise<void> {
    return new Promise((resolve: (value: void | PromiseLike<void>) => void) => {
        setImmediate(resolve);
    });
}

describe('EventService', () => {
    let module: TestingModule;

    let sut: EventService;

    let logger: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [EventService],
        }).compile();

        sut = module.get(EventService);
        logger = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('subscribe', () => {
        it('should subscribe', () => {
            const handler: EventHandlerType<BaseEvent> = vi.fn();

            sut.subscribe(TestEvent, handler);

            sut.publish(new TestEvent());

            expect(handler).toHaveBeenCalled();
        });
    });

    describe('unsubscribe', () => {
        it('should unsubscribe the handler', () => {
            const handler: Mock = vi.fn();

            sut.subscribe(TestEvent, handler);
            sut.publish(new TestEvent());
            expect(handler).toHaveBeenCalled();
            handler.mockReset();

            sut.unsubscribe(TestEvent, handler);
            sut.publish(new TestEvent());
            expect(handler).not.toHaveBeenCalled();
        });

        it('should should do nothing without subscription', () => {
            const handler: Mock = vi.fn();

            sut.unsubscribe(TestEvent, handler);
            sut.publish(new TestEvent());
            expect(handler).not.toHaveBeenCalled();
        });

        it('should should do nothing without info', () => {
            const handler: Mock = vi.fn();

            sut.unsubscribe(UnregisteredTestEvent, handler);
            sut.publish(new UnregisteredTestEvent());
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('publish', () => {
        it('should log warning when handler calls keepAlive', () => {
            const handler: EventHandlerType<BaseEvent> = vi.fn((_event: BaseEvent, keepAlive: () => void) => {
                keepAlive();
            });
            const event: TestEvent = new TestEvent();
            sut.subscribe(TestEvent, handler);

            sut.publish(event);

            expect(event).toBeDefined();
            expect(logger.warning).toHaveBeenCalledWith('Calling Keep Alive for Legacy Event System is not supported');
        });

        it('should call handler with event', () => {
            const handler: EventHandlerType<BaseEvent> = vi.fn();
            const event: TestEvent = new TestEvent();
            sut.subscribe(TestEvent, handler);

            sut.publish(event);

            expect(handler).toHaveBeenCalledWith(event, expect.any(Function));
        });

        it('should call multiple handlers', () => {
            const handler1: EventHandlerType<BaseEvent> = vi.fn();
            const handler2: EventHandlerType<BaseEvent> = vi.fn();
            const event: TestEvent = new TestEvent();

            sut.subscribe(TestEvent, handler1);
            sut.subscribe(TestEvent, handler2);

            sut.publish(event);

            expect(handler1).toHaveBeenCalledWith(event, expect.any(Function));
            expect(handler2).toHaveBeenCalledWith(event, expect.any(Function));
        });

        it('should work when no handler is registered', () => {
            const event: TestEvent = new TestEvent();

            expect(() => sut.publish(event)).not.toThrow();
        });

        it('should log errors with stack-trace in event handler', () => {
            const error: Error = new Error();
            const handler: Mock = vi.fn(() => {
                throw error;
            });
            sut.subscribe(TestEvent, handler);

            sut.publish(new TestEvent());

            expect(logger.error).toHaveBeenCalledWith('Error in event handler', error.stack);
        });

        it('should log errors with stack-trace in async event handler', async () => {
            const error: Error = new Error();
            const handler: Mock = vi.fn();
            handler.mockRejectedValueOnce(error);
            sut.subscribe(TestEvent, handler);

            sut.publish(new TestEvent());
            await flushPromises();

            expect(logger.error).toHaveBeenCalledWith('Error in event handler', error.stack);
        });

        it('should log errors without stack-trace in event handler', async () => {
            const error: string = 'Not a real error';
            const handler: Mock = vi.fn();
            handler.mockRejectedValueOnce(error);
            sut.subscribe(TestEvent, handler);

            sut.publish(new TestEvent());
            await flushPromises();

            expect(logger.error).toHaveBeenCalledWith('Error in event handler', error);
        });
    });
});
