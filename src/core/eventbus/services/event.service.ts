import { Injectable } from '@nestjs/common';
import { Subject, Subscription } from 'rxjs';

import { BaseEvent } from '../../../shared/events/index.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { Constructor, EventHandlerType, MaybePromise } from '../types/util.types.js';

type EventInfo<Event> = {
    subject: Subject<Event>;
    subscriptions: Map<unknown, Subscription>;
};

@Injectable()
export class EventService {
    private readonly eventInfoMap: Map<Constructor<BaseEvent>, EventInfo<unknown>> = new Map();

    private readonly neverAbortedSignal: AbortSignal = new AbortController().signal;

    public constructor(private readonly logger: ClassLogger) {}

    public subscribe<Event extends BaseEvent>(eventType: Constructor<Event>, handler: EventHandlerType<Event>): void {
        if (!this.eventInfoMap.has(eventType)) {
            this.eventInfoMap.set(eventType, {
                subject: new Subject(),
                subscriptions: new Map(),
            });
        }

        const { subject, subscriptions }: EventInfo<Event> = this.eventInfoMap.get(eventType) as EventInfo<Event>;

        subscriptions.set(
            handler,
            subject.subscribe({
                next: (event: Event) => {
                    try {
                        const result: MaybePromise<void | Result<unknown, Error>> = handler(
                            event,
                            () => {
                                this.logger.warning('Calling Keep Alive for Legacy Event System is not supported');
                            },
                            this.neverAbortedSignal,
                        );
                        if (result instanceof Promise) {
                            result.catch((err: unknown) => this.logHandlerError(err));
                        }
                    } catch (err) {
                        this.logHandlerError(err);
                    }
                },
            }),
        );
    }

    public unsubscribe<Event extends BaseEvent>(eventType: Constructor<Event>, handler: EventHandlerType<Event>): void {
        const info: EventInfo<Event> | undefined = this.eventInfoMap.get(eventType) as EventInfo<Event> | undefined;

        if (info) {
            const subscription: Subscription | undefined = info.subscriptions.get(handler);

            if (subscription) {
                subscription.unsubscribe();
                info.subscriptions.delete(handler);
            }
        }
    }

    public publish<Event extends BaseEvent>(event: Event): void {
        const info: EventInfo<Event> | undefined = this.eventInfoMap.get(
            event.constructor as Constructor<BaseEvent>,
        ) as EventInfo<Event>;
        info?.subject.next(event);
    }

    private logHandlerError(err: unknown): void {
        const trace: unknown = err instanceof Error ? err.stack : err;

        this.logger.error('Error in event handler', trace);
    }
}
