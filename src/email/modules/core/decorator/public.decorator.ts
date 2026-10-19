import { type CustomDecorator, SetMetadata } from '@nestjs/common';

export const DISABLE_ACCESS_GUARD_FLAG: string = 'disableAccessGuard';

export const Public: () => CustomDecorator = () => SetMetadata<string, boolean>(DISABLE_ACCESS_GUARD_FLAG, true);
