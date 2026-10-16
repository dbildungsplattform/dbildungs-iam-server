import { type BaseEvent } from '../../../shared/events/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor<T = unknown> = new (...args: any[]) => T;

export type MaybePromise<T> = T | Promise<T>;

export type EventHandlerType<Event extends BaseEvent, TResult = unknown> = (
    event: Event,
    keepAlive: () => void,
) => MaybePromise<Result<TResult> | void>;

export type EventHandlerWithKeepAliveType<T extends BaseEvent> = (event: T, keepAlive: () => void) => void;

export type TypedMethodDescriptor<T> = {
    value?: T;
};

export type TypedMethodDecorator<ParentClass, MethodName, MethodType> = (
    t: ParentClass,
    k: MethodName,
    d: TypedMethodDescriptor<MethodType>,
) => void;
