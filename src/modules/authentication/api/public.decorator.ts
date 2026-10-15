import { type CustomDecorator, SetMetadata } from '@nestjs/common';
import { DISABLE_ACCESS_GUARD_FLAG } from './access.guard.js';

export const Public: () => CustomDecorator = () => SetMetadata<string, boolean>(DISABLE_ACCESS_GUARD_FLAG, true);
