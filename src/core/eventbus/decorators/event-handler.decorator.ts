import { SetMetadata } from '@nestjs/common';

import { type BaseEvent } from '../../../shared/events/index.js';
import { EVENT_HANDLER_META } from '../types/metadata-key.js';
import {
    type Constructor,
    type EventHandlerWithKeepAliveType,
    type TypedMethodDecorator,
} from '../types/util.types.js';

export function EventHandler<Event extends BaseEvent, ClassType, MethodName extends keyof ClassType>(
    eventClass: Constructor<Event>,
): TypedMethodDecorator<ClassType, MethodName, EventHandlerWithKeepAliveType<Event>> {
    return SetMetadata(EVENT_HANDLER_META, eventClass);
}
